import { z } from 'zod';

const optionalString = z.preprocess(
  (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
  z.string().optional()
);

const optionalUrl = z.preprocess(
  (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
  z.string().url().optional()
);

const optionalEmail = z.preprocess(
  (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
  z.string().email().optional()
);

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: optionalString,
  SQLITE_DATABASE_URL: optionalString,

  // NextAuth.js v5
  NEXTAUTH_SECRET: optionalString,
  NEXTAUTH_URL: optionalString,
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,

  // Redis & Job Queues
  REDIS_URL: optionalString,
  UPSTASH_REDIS_REST_URL: optionalString,
  UPSTASH_REDIS_REST_TOKEN: optionalString,

  // Resend Email Delivery & Webhooks
  RESEND_API_KEY: optionalString,
  RESEND_WEBHOOK_SECRET: optionalString,
  DEFAULT_SENDER_EMAIL: optionalEmail,
  DEFAULT_SENDER_NAME: optionalString,
  DEFAULT_REPLY_TO: optionalEmail,

  // Auth & Admin Security
  AUTH_DEV_BYPASS: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
    z.enum(['true', 'false']).optional()
  ),
  CRON_SECRET: optionalString,
  PLATFORM_ADMIN_SECRET: optionalString,
  ADMIN_SECRET: optionalString,

  // AI & LLM Embeddings
  EMBEDDING_PROVIDER: z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
    z.enum(['openai']).optional()
  ),
  EMBEDDING_MODEL: optionalString,
  OPENAI_API_KEY: optionalString,

  // App & Observability
  NEXT_PUBLIC_BASE_URL: optionalString,
  SENTRY_DSN: optionalString,
});

export type AppEnv = z.infer<typeof EnvSchema>;

export function validateEnv(env: Record<string, string | undefined> = process.env): AppEnv {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const message = result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid environment: ${message}`);
  }

  if (env.NODE_ENV === 'production') {
    const missing: string[] = [];
    if (!result.data.NEXTAUTH_SECRET) missing.push('NEXTAUTH_SECRET');
    if (!result.data.REDIS_URL) missing.push('REDIS_URL');
    if (!result.data.RESEND_WEBHOOK_SECRET) missing.push('RESEND_WEBHOOK_SECRET');
    if (missing.length > 0) {
      throw new Error(`Missing production environment variables: ${missing.join(', ')}`);
    }
  }

  return result.data;
}
