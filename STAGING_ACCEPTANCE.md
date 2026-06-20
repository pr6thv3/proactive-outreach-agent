# Staging Acceptance Validation

## Purpose

This document describes how to validate the full production loop against real infrastructure. Local-only testing is insufficient — staging validation must exercise PostgreSQL, Redis, BullMQ, Clerk, Resend, and a verified sending domain.

---

## Prerequisites Checklist

Before running the acceptance test, verify each item:

### Infrastructure
- [ ] PostgreSQL database accessible via `DATABASE_URL`
- [ ] Redis server accessible via `REDIS_URL`
- [ ] Resend API key configured via `RESEND_API_KEY`
- [ ] Resend webhook secret configured via `RESEND_WEBHOOK_SECRET`
- [ ] Clerk application keys configured (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`)

### Sending Domain
- [ ] Domain registered in Resend dashboard
- [ ] SPF record configured and verified
- [ ] DKIM record configured and verified
- [ ] DMARC record configured and verified
- [ ] Domain status is `verified` in the app

### Application
- [ ] Prisma migrations applied: `npx prisma migrate deploy`
- [ ] Prisma client generated: `npx prisma generate`
- [ ] Application builds: `npm run build`
- [ ] Worker starts: `npm run worker`
- [ ] Application starts: `npm run start` or `npm run dev`

---

## Running the Acceptance Test

### Local (SQLite) Mode
For logic validation without external services:

```bash
# Reset database
npm run db:push:sqlite

# Run acceptance test
npm run test:staging
```

### Staging (PostgreSQL) Mode
For full infrastructure validation:

```bash
# Ensure .env.local has real staging credentials
# Run acceptance test
cross-env tsx src/__tests__/staging-acceptance.test.ts
```

---

## 13-Step Acceptance Flow

| Step | Action | Success Criteria |
|------|--------|-----------------|
| 1 | Import 20 leads | 20 leads in DB, 0 parse errors |
| 2 | Run cited enrichment | ≥ 10 signals with `sourceUrl` and `sourceTitle` |
| 3 | Rank top 5 opportunities | 5 leads ranked by `leadScore` descending |
| 4 | Generate evidence-backed drafts | 5 drafts in `generated` status with `evidenceSnapshot` |
| 5 | Review citations | ≥ 3 drafts have cited signals with `citationQuality` |
| 6 | Approve/edit one draft | Status = `approved`, edited content persisted |
| 7 | Run send-readiness checks | All checks pass, `traceId` present |
| 8 | Verify unsafe send blocked | DNC lead blocked with visible reason + `remediationTarget` |
| 9 | Send one safe email | Job enqueued with `jobId` |
| 10 | Process Resend webhook | `EmailEvent` created, message status = `sent` |
| 11 | Confirm Results dashboard | Stats API returns 200 with `resultsLoop` shape |
| 12 | Confirm Job Health | Health API returns 200 with `redis`, `queues`, `totals` |
| 13 | Confirm trace IDs visible | `traceId` present in readiness, stats, health, job records |

---

## Exit Criteria

**All 13 steps must succeed in staging with no manual database intervention.**

If any step fails:
1. Document the failure and root cause
2. Fix the issue (allowed under feature freeze if it's a bug, staging fix, or test fix)
3. Re-run the full acceptance test
4. All steps must pass in a single, clean run

---

## Expected Output

A successful run produces output like:

```
╔══════════════════════════════════════════════════════════════╗
║  STAGING ACCEPTANCE TEST — 13-Step Validation Flow         ║
╚══════════════════════════════════════════════════════════════╝

Mode: SQLite (local)
Redis: not configured (database fallback)

── Step 1: Import 20 Leads ─────────────────────────────────────
  ✅ CSV parsing produces 20 leads
  ✅ 20 leads exist in database

── Step 2: Run Cited Enrichment ────────────────────────────────
  ✅ Created 10 signals (expected >= 10)
  ✅ At least one signal has sourceUrl
  ...

╔══════════════════════════════════════════════════════════════╗
║  ACCEPTANCE TEST REPORT                                    ║
╠══════════════════════════════════════════════════════════════╣
║  ✅ Step  1: Import 20 Leads
║  ✅ Step  2: Run Cited Enrichment
║  ✅ Step  3: Rank Top 5 Opportunities
║  ...
║  ✅ Step 13: Trace IDs Visible Throughout
╠══════════════════════════════════════════════════════════════╣
║  Results: XX passed, 0 failed, XX total
╚══════════════════════════════════════════════════════════════╝
```
