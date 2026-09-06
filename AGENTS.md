# ProactiveReach — Engineering & Architectural Guidelines

## Core Invariants & Conventions

1. **Proxy Convention**: Next.js 16+ uses `src/proxy.ts` (exporting `export default async function proxy(request)`) instead of `src/middleware.ts`.
2. **Dynamic Route Directories**: Dynamic route directories must use literal brackets on disk (e.g., `src/app/api/leads/[id]/route.ts`), not URL-encoded `%5Bid%5D`.
3. **Prisma Server Components**: Include `export const dynamic = 'force-dynamic';` on all App Router page server components that perform Prisma database queries.
4. **Inngest v3 Handlers**: In Inngest 3.x, define functions using `inngest.createFunction({ id, name, event }, handler)`.
5. **Pre-Send Safety Audit**: Always evaluate the 7-step send-readiness checklist (`DeliverabilityService.evaluateSendReadiness()`) before dispatching any cold outreach emails.
6. **Multi-Tenancy**: Every business model query must be scoped by `organizationId`.
