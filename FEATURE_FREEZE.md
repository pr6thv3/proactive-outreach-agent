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

All deferred features and integrations are tracked in [BACKLOG.md](file:///c:/Users/Preethve/proactive-outreach-agent/BACKLOG.md).

Any new feature request must be added to `BACKLOG.md` with a brief description and deferred until after pilot validation.

## Freeze Lift Condition

This freeze is lifted only after **all three conditions** are met:

1. **Staging Acceptance**: All 13 acceptance flow steps pass against real infrastructure (PostgreSQL, Redis, Resend, Clerk, verified domain).
2. **Failure-State QA**: All 12 failure scenarios produce clear, actionable UI responses with no silent failures.
3. **Pilot Onboarding**: At least 1 of 3 pilot users has completed initial setup and imported leads.

## Pilot Candidate Baseline

The release candidate baseline is tagged at:

```
Tag:    beta-0.1-20-lead-loop-rc1
Commit: e75b07b
```

All staging validation must be performed against this tag or its direct descendants (freeze-compliant patches only).
