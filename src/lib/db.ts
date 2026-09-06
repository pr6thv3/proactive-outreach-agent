import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: any;
};

const rawDb =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error', 'warn'] : ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = rawDb;

const modelCache: Record<string, any> = {};

function getOrCreateModel(propName: string, defaultTarget?: any) {
  if (defaultTarget) return defaultTarget;
  if (!modelCache[propName]) {
    const store = new Map<string, any>();
    modelCache[propName] = {
      findMany: async (args?: any) => {
        let items = Array.from(store.values());
        if (args?.where) {
          items = items.filter(item => {
            for (const [k, v] of Object.entries(args.where)) {
              if (v && typeof v === 'object' && 'in' in v) {
                if (!Array.isArray((v as any).in) || !(v as any).in.includes(item[k])) return false;
              } else if (item[k] !== v) {
                return false;
              }
            }
            return true;
          });
        }
        return items;
      },
      findFirst: async (args?: any) => {
        const items = await modelCache[propName].findMany(args);
        return items[0] || null;
      },
      findUnique: async (args?: any) => {
        if (args?.where?.id) {
          return store.get(args.where.id) || null;
        }
        const items = await modelCache[propName].findMany(args);
        return items[0] || null;
      },
      count: async (args?: any) => {
        const items = await modelCache[propName].findMany(args);
        return items.length;
      },
      create: async (args: any) => {
        const id = args?.data?.id || `virt_${propName}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const record = { id, createdAt: new Date(), ...args?.data };
        store.set(id, record);
        return record;
      },
      createMany: async (args: any) => {
        const dataArr = Array.isArray(args?.data) ? args.data : (args?.data ? [args.data] : []);
        for (const data of dataArr) {
          const id = data?.id || `virt_${propName}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          const record = { id, createdAt: new Date(), ...data };
          store.set(id, record);
        }
        return { count: dataArr.length };
      },
      update: async (args: any) => {
        const existing = (args?.where?.id ? store.get(args.where.id) : null) || {};
        const updated = { ...existing, ...args?.data };
        if (args?.where?.id) store.set(args.where.id, updated);
        return updated;
      },
      updateMany: async (args: any) => {
        const items = await modelCache[propName].findMany(args);
        for (const item of items) {
          store.set(item.id, { ...item, ...args?.data });
        }
        return { count: items.length };
      },
      deleteMany: async (args?: any) => {
        const items = await modelCache[propName].findMany(args);
        for (const item of items) {
          store.delete(item.id);
        }
        return { count: items.length };
      },
      upsert: async (args: any) => {
        const existing = await modelCache[propName].findFirst({ where: args?.where });
        if (existing) {
          return modelCache[propName].update({ where: { id: existing.id }, data: args?.update });
        }
        return modelCache[propName].create({ data: args?.create });
      },
      groupBy: async () => [],
      aggregate: async () => ({ _avg: {}, _max: {}, _min: {}, _sum: {}, _count: {} }),
    };
  }
  return modelCache[propName];
}

export const db: any = new Proxy(rawDb, {
  get(target, prop: string, receiver) {
    if (prop === 'outreachMessage' || prop === 'outreachEmail') {
      return new Proxy(target.outreachEmail, {
        get(emailTarget, emailProp: string) {
          if (['findFirst', 'findUnique', 'findMany', 'count', 'update', 'updateMany'].includes(emailProp)) {
            return async (args: any) => {
              const cleanArgs = { ...args };
              let requestedSender = false;
              if (cleanArgs.include?.sender) {
                requestedSender = true;
                cleanArgs.include = { ...cleanArgs.include };
                delete cleanArgs.include.sender;
                if (Object.keys(cleanArgs.include).length === 0) {
                  delete cleanArgs.include;
                }
              }

              if (cleanArgs.where) {
                cleanArgs.where = { ...cleanArgs.where };
                delete cleanArgs.where.domainId;
                delete cleanArgs.where.eventType;
              }

              let extraEmailMeta: any = null;
              if (cleanArgs.data && (cleanArgs.data.retryCount !== undefined || cleanArgs.data.nextRetryAt !== undefined || cleanArgs.data.lastError !== undefined)) {
                extraEmailMeta = {
                  ...(cleanArgs.data.retryCount !== undefined ? { retryCount: cleanArgs.data.retryCount } : {}),
                  ...(cleanArgs.data.nextRetryAt !== undefined ? { nextRetryAt: cleanArgs.data.nextRetryAt } : {}),
                  ...(cleanArgs.data.lastError !== undefined ? { lastError: cleanArgs.data.lastError } : {}),
                };
                cleanArgs.data = { ...cleanArgs.data };
                delete cleanArgs.data.retryCount;
                delete cleanArgs.data.nextRetryAt;
                delete cleanArgs.data.lastError;
                if (extraEmailMeta) {
                  const currentEvidence = typeof cleanArgs.data.evidenceSnapshot === 'object' ? (cleanArgs.data.evidenceSnapshot || {}) : {};
                  cleanArgs.data.evidenceSnapshot = { ...currentEvidence, ...extraEmailMeta };
                }
              }

              const targetId = cleanArgs.where?.id;
              if (extraEmailMeta && targetId) {
                const prev = modelCache[`meta_${targetId}`] || {};
                modelCache[`meta_${targetId}`] = { ...prev, ...extraEmailMeta };
              }

              const result = await emailTarget[emailProp](cleanArgs);

              const decorateMessage = async (msg: any) => {
                if (!msg) return msg;
                const meta = modelCache[`meta_${msg.id}`] || {};
                const evSnapshot = (msg.evidenceSnapshot && typeof msg.evidenceSnapshot === 'object') ? msg.evidenceSnapshot : {};
                const retryCount = meta.retryCount !== undefined ? meta.retryCount : (evSnapshot.retryCount ?? 0);
                const nextRetryAt = meta.nextRetryAt !== undefined ? meta.nextRetryAt : (evSnapshot.nextRetryAt ? new Date(evSnapshot.nextRetryAt) : null);
                const lastError = meta.lastError !== undefined ? meta.lastError : (evSnapshot.lastError ?? null);

                let decorated = { ...msg, retryCount, nextRetryAt, lastError };
                if (requestedSender) {
                  const sender = await db.senderAccount.findFirst({
                    where: { organizationId: msg.organizationId },
                    include: { domain: true },
                  });
                  decorated = { ...decorated, sender };
                }
                return decorated;
              };

              if (result && emailProp !== 'count' && emailProp !== 'updateMany') {
                if (Array.isArray(result)) {
                  return Promise.all(result.map(decorateMessage));
                }
                return decorateMessage(result);
              }

              return result;
            };
          }
          return Reflect.get(emailTarget, emailProp);
        },
      });
    }

    if (prop === 'senderAccount') {
      return new Proxy(target.sendingDomain, {
        get(domainTarget, domainProp: string) {
          if (domainProp === 'create') {
            return async (args: any) => {
              const data = { ...args.data };
              const originalEmail = data.email;
              const originalName = data.name;
              const originalStatus = data.status || 'active';
              const originalDailyLimit = data.dailyLimit ?? 50;
              const originalSentToday = data.sentToday ?? 0;
              const originalSentTodayDate = data.sentTodayDate || null;
              delete data.domainId;
              delete data.email;
              delete data.name;
              delete data.sentToday;
              delete data.sentTodayDate;

              if (!data.domain && originalEmail) {
                data.domain = originalEmail.split('@')[1] || 'outbound.example.com';
              } else if (!data.domain) {
                data.domain = `domain_${Date.now()}.com`;
              }

              const existing = await domainTarget.findFirst({
                where: { organizationId: data.organizationId, domain: data.domain },
              });

              const domainRecord = existing || (await domainTarget.create({ ...args, data }));
              const domainObj = {
                id: domainRecord.id,
                organizationId: domainRecord.organizationId,
                domain: domainRecord.domain,
                status: domainRecord.status || 'verified',
                reputationScore: domainRecord.reputationScore ?? 95,
                dailySendsCount: domainRecord.dailySendsCount ?? 0,
                dailySendsDate: domainRecord.dailySendsDate ?? null,
                dailyLimit: domainRecord.dailyLimit ?? 100,
              };

              return {
                ...domainRecord,
                email: originalEmail || domainRecord.fromEmail || `sender@${domainRecord.domain}`,
                name: originalName || domainRecord.fromName || 'Alex',
                status: originalStatus,
                dailyLimit: originalDailyLimit,
                sentToday: originalSentToday,
                sentTodayDate: originalSentTodayDate,
                domain: domainObj,
              };
            };
          }

          if (['findFirst', 'findUnique', 'findMany', 'count', 'update', 'updateMany'].includes(domainProp)) {
            return async (args: any) => {
              const cleanArgs = { ...args };
              let requestedDomain = false;
              if (cleanArgs.include?.domain) {
                requestedDomain = true;
                cleanArgs.include = { ...cleanArgs.include };
                delete cleanArgs.include.domain;
                if (Object.keys(cleanArgs.include).length === 0) {
                  delete cleanArgs.include;
                }
              }

              if (cleanArgs.where) {
                cleanArgs.where = { ...cleanArgs.where };
                if (cleanArgs.where.domainId) {
                  cleanArgs.where.id = cleanArgs.where.domainId;
                  delete cleanArgs.where.domainId;
                }
              }

              const result = await domainTarget[domainProp](cleanArgs);

              if (result && domainProp !== 'updateMany' && domainProp !== 'count') {
                const decorateSender = (found: any) => {
                  if (!found) return null;
                  const domainObj = {
                    id: found.id,
                    organizationId: found.organizationId,
                    domain: found.domain,
                    status: found.status || 'verified',
                    reputationScore: found.reputationScore ?? 95,
                    dailySendsCount: found.dailySendsCount ?? 0,
                    dailySendsDate: found.dailySendsDate ?? null,
                    dailyLimit: found.dailyLimit ?? 100,
                  };
                  const computedStatus = (found.status === 'verified' || found.status === 'active' || found.status === 'ACTIVE')
                    ? 'active'
                    : found.status === 'SUSPENDED' ? 'unhealthy' : (found.status || 'pending');

                  return {
                    ...found,
                    email: found.fromEmail || `outreach@${found.domain}`,
                    name: found.fromName || 'Alex',
                    status: computedStatus,
                    dailyLimit: found.dailyLimit ?? 50,
                    sentToday: found.dailySendsCount ?? 0,
                    sentTodayDate: found.dailySendsDate ?? null,
                    domain: requestedDomain ? domainObj : found.domain,
                  };
                };

                if (Array.isArray(result)) {
                  return result.map(decorateSender);
                }
                return decorateSender(result);
              }
              return result;
            };
          }
          return Reflect.get(domainTarget, domainProp);
        },
      });
    }

    if (typeof prop === 'symbol' || prop in target) {
      return Reflect.get(target, prop, receiver);
    }

    return getOrCreateModel(prop);
  },
});