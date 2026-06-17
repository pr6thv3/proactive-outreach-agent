# Proactive Outreach Agent - Boot Guide

This file is the repo-local operating guide for Codex agents and contributors working in `C:\Users\Preethve\proactive-outreach-agent`.

It documents the access and setup required to work cleanly. It does not grant GitHub, Clerk, Resend, DNS, database, Redis, deployment, or logging permissions. Those must be provided through the relevant external systems.

## Project Context

- Repository: `pr6thv3/proactive-outreach-agent`
- Local checkout: `C:\Users\Preethve\proactive-outreach-agent`
- Stack: Next.js 16, React 19, TypeScript, Tailwind, shadcn/Radix UI, Prisma, PostgreSQL, BullMQ, Redis, Clerk, Resend, and optional OpenAI embeddings.
- Database target: PostgreSQL through `DATABASE_URL`. SQLite exists only as a local development path through the `db:*:sqlite` scripts.
- Worker target: BullMQ worker process started with `bun run worker` or `bun run dev:worker`; it requires `REDIS_URL`.
- Email target: Resend for sending, webhooks, events, tracking, bounce handling, and deliverability state.

## Current Priority

Do not broaden the product before proving the core Phase 1 workflow:

`lead import -> signal extraction -> lead score -> AI draft -> human approval -> safe-send check -> send/block -> webhook event -> dashboard update`

Current work should favor staging reliability, sender/domain safety, worker visibility, and deployment/run documentation over new product surface area.

## Required Access

Must-have access for clean project work:

- GitHub write access to `pr6thv3/proactive-outreach-agent`.
- Local folder access to `C:\Users\Preethve\proactive-outreach-agent`.
- Permission to run shell commands in this workspace for dependency install, typecheck, lint, tests, Prisma commands, builds, and worker runs.
- Branch workflow access: create branches, commit, push, and open pull requests.
- Environment variable access through `.env.local` or a secret manager.

Strongly recommended access for real staging validation:

- PostgreSQL database access for development/staging and migration testing.
- Redis access for BullMQ worker testing.
- Clerk admin access for the application, organizations, and roles.
- Resend dashboard access for domains, webhooks, sending logs, and API key management.
- DNS access for the sending domain so SPF, DKIM, and DMARC can be configured and verified.
- Deployment access for the Next.js app and worker host, such as Vercel plus Render, Fly, or Railway.
- Log/monitoring access, such as Sentry or platform logs.

Optional future access:

- Telegram bot credentials and admin rights only if Telegram integration is explicitly being built.
- CRM or calendar credentials only if those integrations are in scope.
- Marketing, brand, and product copy assets only when dashboard/docs polish is in scope.

## Environment

Use `.env.local` for local secrets. Never commit real credentials, tokens, private URLs, or `.env.local`.

Expected variables:

```bash
DATABASE_URL=
REDIS_URL=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=
NEXT_PUBLIC_BASE_URL=
DEFAULT_SENDER_EMAIL=
DEFAULT_SENDER_NAME=
DEFAULT_REPLY_TO=
OPENAI_API_KEY=
```

Notes:

- `DATABASE_URL` is required by the primary Prisma schema.
- `REDIS_URL` is required to start BullMQ workers.
- Clerk keys are required for real auth flows; local development can use the repo's dev bypass when configured.
- Resend variables are required for real email sending and webhook verification.
- `NEXT_PUBLIC_BASE_URL` is used for public links, tracking, and webhook-related URLs.
- `OPENAI_API_KEY` is required only when AI/embeddings are used.
- Optional embedding settings in `.env.example` are `EMBEDDING_PROVIDER` and `EMBEDDING_MODEL`.
- Optional local-only SQLite setting in `.env.example` is `SQLITE_DATABASE_URL`.

## Commands

Prefer Bun because `bun.lock` is tracked and the README uses Bun-first setup. Use npm equivalents only when Bun is unavailable.

Install and run:

```bash
bun install
bun run dev
```

Quality gates:

```bash
bun run typecheck
bun run lint
bun run test
bun run build
```

Database:

```bash
bun run db:generate
bun run db:push
bun run db:migrate
```

SQLite-only local commands:

```bash
bun run db:generate:sqlite
bun run db:push:sqlite
bun run db:validate:sqlite
```

Worker:

```bash
bun run worker
bun run dev:worker
```

Useful validation:

```bash
bun run db:validate
bun run smoke
```

## Branch and PR Workflow

- Work from feature branches named like `codex/<short-task-name>`.
- Keep commits scoped to intentional project changes.
- Do not commit `.env`, `.env.local`, logs, build output, generated local databases, credentials, or private deployment metadata.
- Before pushing, run the relevant checks for the change. For application changes, default to `bun run typecheck`, `bun run lint`, `bun run test`, and `bun run build` unless the task is docs-only.
- Push the branch and open a PR against the repo's default integration branch.
- Mention any checks that could not be run and why.

## Architecture & Safety Standards

### 🛡️ Send-Readiness Evaluator
All outreach messages must undergo pre-send validation via the shared `evaluateSendReadiness()` engine (`src/lib/deliverability/send-readiness.ts`). The evaluator checks:
- **Lead safety**: Do-Not-Contact (DNC) list status, unsubscribe state, blacklisting, and email validation.
- **Campaign and Sender health**: Campaign status (must be active), sender account status (must be active), sending domain verification status (must be verified), and reputation score (must be >= 30; marginal scores 30-50 trigger warning logs).
- **Rate limiting and Quotas**: Warmup schedule daily limits, absolute daily domain limits, and Redis queue health.

A pre-check is executed at enqueue time, and `assertReadyToSend()` is run inside the worker process immediately before sending to provide defense-in-depth safety.

### 🔍 Trace ID Standard
Every action in the system must be linked to a unique `traceId` (generated via `createTraceId()` from `src/lib/api/responses.ts`). 
- Pass `traceId` through all API payloads, database logs, and queue job contexts.
- Use the trace ID when logging error or block states to easily correlate actions in the worker process with user events on the frontend.

### 🩺 Job Health & Monitoring Endpoint
The Job Health API (`GET /api/jobs/health`) provides real-time infrastructure status. It monitors:
- **Redis Connection**: Returns connection status, configuration status, and latency.
- **Queue Breakdown**: Monitors waiting, active, completed, failed, and delayed job counts per BullMQ queue.
- **Totals & Fallbacks**: Exposes counts of stale, failed, dead, and pending jobs. If Redis is down, it returns `queued_without_redis: true` indicating database-only queue fallback is active.

## Safety Rules

- Preserve approval-first sending. Do not make auto-send the default.
- Do not weaken deliverability gates, DNC checks, unsubscribe handling, bounce handling, complaint handling, or verified-domain requirements.
- Treat Postgres, Redis, Resend, Clerk, DNS, and deployment access as real infrastructure. Prefer staging validation before production changes.
- Keep tenant/workspace isolation intact when touching API routes, Prisma queries, queue jobs, or webhook processing.
- For worker-related changes, test both queue production and worker processing when Redis is available.
- For webhook-related changes, verify signature handling and organization resolution paths.
- Ensure all safety evaluations and API boundaries preserve the trace ID standard.

## Verification Checklist

For this boot guide:

- Confirm `AGENTS.md` exists at the repository root.
- Confirm it contains no real secrets or private credentials.
- Confirm documented commands exist in `package.json`.
- Confirm documented environment variables match `.env.example` and `src/lib/env.ts`.

For Phase 1 staging readiness:

- App can boot with real `.env.local` values.
- Prisma can generate and apply the schema against Postgres.
- Worker can start and connect to Redis.
- A real lead can move through import, observe, think, approval, send/block, webhook, and dashboard update.
- Failure states are tested: Redis down, worker stopped, unverified domain, missing sender, bounced email.
