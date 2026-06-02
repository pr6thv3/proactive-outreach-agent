import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url().optional(),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
  CLERK_SECRET_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_BASE_URL: z.string().url().optional(),
  DEFAULT_SENDER_EMAIL: z.string().email().optional(),
  DEFAULT_SENDER_NAME: z.string().optional(),
  DEFAULT_REPLY_TO: z.string().email().optional(),
  AUTH_DEV_BYPASS: z.enum(['true', 'false']).optional(),
  EMBEDDING_PROVIDER: z.enum(['openai']).optional(),
  EMBEDDING_MODEL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
});

export type AppEnv = z.infer<typeof EnvSchema>;

export function validateEnv(env = process.env): AppEnv {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const message = result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid environment: ${message}`);
  }

  if (env.NODE_ENV === 'production') {
    const missing: string[] = [];
    if (!result.data.REDIS_URL) missing.push('REDIS_URL');
    if (!result.data.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) missing.push('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY');
    if (!result.data.CLERK_SECRET_KEY) missing.push('CLERK_SECRET_KEY');
    if (!result.data.RESEND_WEBHOOK_SECRET) missing.push('RESEND_WEBHOOK_SECRET');
    if (missing.length > 0) {
      throw new Error(`Missing production environment variables: ${missing.join(', ')}`);
    }
  }

  return result.data;
}
