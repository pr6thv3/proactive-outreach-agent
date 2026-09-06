import fs from 'node:fs';
import path from 'node:path';

let passed = 0;
let failed = 0;

function read(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), 'utf8');
}

function assert(condition: unknown, message: string) {
  if (!condition) {
    failed++;
    console.error(`  ❌ ${message}`);
    return;
  }
  passed++;
  console.log(`  ✅ ${message}`);
}

function section(title: string) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(1, 64 - title.length))}`);
}

section('Auth and API Boundary');
const middlewarePath = fs.existsSync(path.join(process.cwd(), 'src/proxy.ts')) ? 'src/proxy.ts' : 'src/middleware.ts';
const middleware = read(middlewarePath);
assert(middleware.includes('getToken'), 'NextAuth session token middleware/proxy active');
assert(middleware.includes('/api/webhooks'), 'Webhook routes are excluded from interactive auth');
assert(fs.existsSync(path.join(process.cwd(), middlewarePath)), 'NextAuth proxy.ts / middleware.ts is active');

const orchestrate = read('src/app/api/orchestrate/route.ts');
assert(orchestrate.includes('z.union'), 'Orchestrate route uses Zod action validation');
assert(orchestrate.includes('ACTION_ROLES'), 'Orchestrate route declares action-level RBAC');
for (const action of [
  'add_lead',
  'import_csv',
  'run_observe',
  'run_think',
  'run_full_pipeline',
  'batch_generate',
  'approve_message',
  'send_message',
  'run_reeval',
  'enable_autonomy',
  'run_autonomous_cycle',
]) {
  assert(orchestrate.includes(action), `Orchestrate preserves ${action}`);
}

section('Tenant Isolation');
const schema = read('prisma/schema.prisma');
for (const model of [
  'Organization',
  'OrganizationMember',
  'Lead',
  'Campaign',
  'OutreachEmail',
  'DoNotContact',
  'AgentMemory',
  'JobQueue',
  'SendingDomain',
]) {
  assert(schema.includes(`model ${model}`), `Schema includes ${model}`);
}
assert(schema.includes('@@unique([organizationId, email])'), 'Lead/DNC/sender email uniqueness is workspace-scoped');
assert(schema.includes('@@unique([organizationId, domain])'), 'Sending domain uniqueness is workspace-scoped');
assert(read('src/app/api/leads/route.ts').includes('organizationId: context.organizationId'), 'Leads API scopes queries to workspace');
assert(read('src/app/api/messages/route.ts').includes('organizationId: context.organizationId'), 'Messages API scopes queries to workspace');
assert(read('src/app/api/jobs/route.ts').includes('organizationId: context.organizationId'), 'Jobs API scopes queries to workspace');

section('Queue and Worker Architecture');
const queueTypes = read('src/lib/queue/types.ts');
for (const field of ['organizationId: string', 'traceId: string', 'attempt: number', 'createdAt: string', 'jobRecordId?: string']) {
  assert(queueTypes.includes(field), `Queue job data includes ${field}`);
}
const producers = read('src/lib/queue/producers.ts');
assert(producers.includes("throw new Error('organizationId is required for queue jobs')"), 'Queue producer rejects missing organizationId');
assert(producers.includes('deduplication'), 'Autonomous jobs use BullMQ deduplication metadata');
const worker = read('src/lib/queue/worker.ts');
assert(worker.includes('runTrackedProcessor'), 'Worker wraps processors with DB status tracking');
assert(worker.includes('deadLetteredAt'), 'Worker records dead-lettered failed jobs');

section('Deliverability Safety');
const deliverability = read('src/lib/deliverability/index.ts');
assert(deliverability.includes('assertCanSend'), 'Deliverability service exposes assertCanSend gate');
assert(deliverability.includes('selectSender'), 'Deliverability service selects a tenant sender before send');
assert(deliverability.includes("domain.status !== 'verified'"), 'Unverified domains block sending');
assert(deliverability.includes("sender.status !== 'active'"), 'Inactive senders block sending');
assert(!deliverability.includes('getBestSendingDomain'), 'Global best-domain fallback has been removed');

const webhookRoute = read('src/app/api/webhooks/resend/route.ts');
assert(webhookRoute.includes('verifySignature'), 'Resend webhook verifies Svix signature');
assert(webhookRoute.includes("enqueueJob('webhook-processing'"), 'Resend webhook enqueues processing job');
assert(webhookRoute.includes('resolveWebhookOrganizationId'), 'Resend webhook resolves workspace before enqueue');

section('Database Strategy');
const sqliteSchema = read('prisma/schema.sqlite.prisma');
assert(schema.includes('provider = "postgresql"'), 'Primary Prisma schema targets PostgreSQL');
assert(sqliteSchema.includes('provider = "sqlite"'), 'Separate SQLite schema exists for local development');
assert(schema.includes('Unsupported("vector")'), 'PostgreSQL schema preserves pgvector column');
assert(!sqliteSchema.includes('Unsupported("vector")'), 'SQLite schema omits pgvector column');
assert(read('prisma/migrations/20260528000000_pg_saas_foundation/migration.sql').includes('CREATE EXTENSION IF NOT EXISTS vector'), 'Migration enables pgvector');

section('Package Scripts');
const pkg = JSON.parse(read('package.json'));
for (const script of ['typecheck', 'lint', 'test', 'smoke', 'worker', 'dev:worker', 'db:validate', 'db:validate:sqlite']) {
  assert(Boolean(pkg.scripts[script]), `package.json defines ${script}`);
}
assert(!pkg.scripts.start.includes('bun'), 'start script does not depend on Bun');

console.log(`\n════════════════════════════════════════════════════════════════`);
console.log(`Architecture results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`════════════════════════════════════════════════════════════════`);

if (failed > 0) {
  process.exit(1);
}
