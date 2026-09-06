# E2E Test Infra: ProactiveReach Autonomous AI SDR

## Test Philosophy
- Opaque-box, requirement-driven. No dependency on internal implementation shortcuts.
- Derived directly from `ORIGINAL_REQUEST.md` (R1–R6, POV 1, POV 2, POV 3).
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Combinatorial Testing + Real-World Workload Testing.

---

## Feature Inventory & Test Mapping

| # | Feature | Requirement Source | Tier 1 (Coverage) | Tier 2 (Boundary) | Tier 3 (Pairwise) | Tier 4 (Workload) |
|---|---------|-------------------|:-----------------:|:-----------------:|:-----------------:|:-----------------:|
| 1 | Conversational Onboarding & ICP Extraction | R1 / POV 1 | 5 cases | 5 cases | ✓ | ✓ |
| 2 | Automated Discovery & "Why Qualified" Cards | R2 / POV 1 | 5 cases | 5 cases | ✓ | ✓ |
| 3 | 5-Second Review Queue & Autopilot Loop | R3 / POV 1 | 5 cases | 5 cases | ✓ | ✓ |
| 4 | Multi-Step Sequences & AI Smart Inbox | R4 / POV 2 | 5 cases | 5 cases | ✓ | ✓ |
| 5 | Outcome Dashboard & Clear Domain Setup | R5 / POV 1, 3 | 5 cases | 5 cases | ✓ | ✓ |
| 6 | Agency Multi-Tenant Admin Separation | R6 / POV 3 | 5 cases | 5 cases | ✓ | ✓ |

---

## 4-Tier Test Architecture

### Tier 1: Feature Coverage (≥5 per feature = ≥30 cases)
- **T1.1**: Onboarding wizard translates plain-English goals into structured `IcpCriteria` and 4-step sequence.
- **T1.2**: Prospect discovery feed returns uncontacted leads with "Why Qualified" cards (Signal, ICP Match, Angle, AI Score, MX gate).
- **T1.3**: 5-second review queue actions (Approve, Edit, Reject, Regenerate, Bulk Approve).
- **T1.4**: Dynamic multi-step follow-up sequences with 6-category Smart Inbox classification (`interested`, `meeting_request`, `question`, `not_interested`, `out_of_office`, `unsubscribe`).
- **T1.5**: Outcome dashboard funnel tracking (Discovered $\rightarrow$ Contacted $\rightarrow$ Replied $\rightarrow$ Interested $\rightarrow$ Meeting Booked).
- **T1.6**: Agency admin portal multi-tenant isolation, tenant health metrics, and token cost tracking.

### Tier 2: Boundary & Corner Cases (≥5 per feature = ≥30 cases)
- **T2.1**: Malformed/empty goal prompts, extreme company size boundaries (min > max), unicode characters in ICP.
- **T2.2**: Zero-signal prospects, unverified MX domains, low-confidence scores (< 50).
- **T2.3**: Unapproved draft send prevention, concurrent bulk approval races, empty review queues.
- **T2.4**: Multi-intent inbound replies, adversarial prompt injections in replies, OOO return date edge cases.
- **T2.5**: Zero-send dashboard states, partial domain DNS verification (e.g. SPF passes, DKIM pending).
- **T2.6**: Cross-tenant ID query attempts, non-admin role unauthorized access attempts.

### Tier 3: Cross-Feature Combinations (Pairwise Coverage)
- **T3.1**: Onboarding Goal $\rightarrow$ Discovery Feed $\rightarrow$ "Why Qualified" Card $\rightarrow$ Draft Generation.
- **T3.2**: Review Queue Edit $\rightarrow$ Compounding Memory Phrase Extraction $\rightarrow$ Future Draft Refinement.
- **T3.3**: Inbound "Unsubscribe" Reply $\rightarrow$ Smart Inbox Classification $\rightarrow$ Follow-up Cancellation $\rightarrow$ Permanent DNC Suppression.
- **T3.4**: High Bounce Rate Webhook $\rightarrow$ Circuit Breaker Trip $\rightarrow$ Campaign Auto-Pause $\rightarrow$ Zero Message Loss in Queue.
- **T3.5**: Autopilot Toggle ON $\rightarrow$ Full Background Discovery $\rightarrow$ Verification $\rightarrow$ Send Readiness Audit $\rightarrow$ Upstash Rate-Limited Dispatch.

### Tier 4: Real-World Application Scenarios (POV Acceptance Workloads)
- **Scenario 4.1 (POV 1: Client/SDR Autonomous Workflow)**: User onboards with cybersecurity B2B goal $\rightarrow$ System configures ICP & 4-step sequence $\rightarrow$ Discovers 5 prospects with "Why Qualified" cards $\rightarrow$ SDR reviews top lead in 5 seconds $\rightarrow$ Enables Autopilot $\rightarrow$ Dashboard tracks pipeline stage advancement to Meeting Booked.
- **Scenario 4.2 (POV 2: Prospect/Recipient Safe Engagement)**: Discovered lead receives email citing live Series B funding signal $\rightarrow$ Follow-up Day 3 scheduled $\rightarrow$ Lead replies "Let's schedule a demo" $\rightarrow$ Sequence immediately stops $\rightarrow$ Smart Inbox classifies `meeting_request` $\rightarrow$ Escalates with calendar link.
- **Scenario 4.3 (POV 2: Recipient Opt-Out Protection)**: Prospect receives outreach $\rightarrow$ Replies "Please remove me" $\rightarrow$ Smart Inbox classifies `unsubscribe` $\rightarrow$ Sequence cancelled $\rightarrow$ Contact permanently blacklisted & added to DNC table $\rightarrow$ 0 future dispatches across all campaigns.
- **Scenario 4.4 (POV 3: Agency Deliverability & System Safety)**: Domain DNS setup verified with green badges $\rightarrow$ Campaign dispatches with Upstash Redis jitter $\rightarrow$ Simulated bounce spike $>3\%$ triggers circuit breaker with human-friendly reason $\rightarrow$ Agency admin monitors tenant health & token usage with 0 cross-tenant leaks.

---

## Test Execution Commands
```bash
# 1. Typecheck
npm run typecheck

# 2. Hardening pipeline
npm run test:hardening

# 3. E2E Test Suite
cross-env SQLITE_DATABASE_URL=file:./dev.db AUTH_DEV_BYPASS=true tsx src/__tests__/e2e-suite.test.ts
```
