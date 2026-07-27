# Feature Freeze — Effective 2026-06-19

This repository is under **active feature freeze** as part of the 30-Day Beta Hardening cycle.

## Status

**FREEZE ACTIVE** — No new features, enhancements, workflows, integrations, or UI additions.

## Allowed Changes

Only the following change categories are permitted during the freeze:

| Category | Example |
|----------|---------|
| Bug fixes | Fix crash in send-readiness evaluator |
| Staging fixes | Fix Prisma migration ordering for PostgreSQL |
| Copy/UX clarity | Improve error message wording in approval queue |
| Security fixes | Patch webhook signature verification edge case |
| Deliverability fixes | Fix warmup schedule calculation |
| Test fixes | Fix flaky beta-contract test timing |
| Documentation fixes | Correct DEPLOYMENT.md environment variable name |

## Deferred Items

All deferred features and integrations are tracked in [BACKLOG.md](./BACKLOG.md).

Any new feature request must be added to `BACKLOG.md` with a brief description and deferred until after pilot validation.

## Freeze Lift Condition

This freeze is lifted only after **all three conditions** are met:

1. **Staging Acceptance**: All 13 acceptance flow steps pass against real infrastructure (PostgreSQL, Redis, Resend, Clerk, verified domain).
2. **Failure-State QA**: All 12 failure scenarios produce clear, actionable UI responses with no silent failures.
3. **Client Onboarding**: At least 1 real client organization has completed onboarding, connected and verified a sending domain, and sent live (non-dry-run) outreach.

## Pilot Candidate Baseline

The release candidate baseline is tagged at:

```
Tag:    beta-0.1-20-lead-loop-rc1
Commit: 0bc753d
```

All staging validation must be performed against this tag or its direct descendants (freeze-compliant patches only).

> [!NOTE]
> **Ratification Addendum (2026-07-24)**: Commit `3c10ac2` ("Specify and implement Strategy Engine and Risk Gates") introduced `src/lib/strategy/` and `src/lib/risk/`. These modules provide send-readiness safety gates, deliverability protection, and circuit breakers, which are ratified as freeze-compliant safety and deliverability infrastructure under category #4 (Security/Deliverability fixes).

