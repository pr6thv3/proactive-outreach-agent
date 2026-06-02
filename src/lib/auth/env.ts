export function isClerkConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
}

export function isDevAuthBypassEnabled(): boolean {
  return process.env.AUTH_DEV_BYPASS === 'true' || (!isClerkConfigured() && process.env.NODE_ENV !== 'production');
}
