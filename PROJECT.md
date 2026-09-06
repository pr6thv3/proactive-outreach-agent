# ProactiveReach B2B Outreach Automation SaaS: Platform Architecture & Elevation Specification

## Architecture Overview
ProactiveReach is a Next.js 16 App Router full-stack Autonomous AI SDR platform built on TypeScript, Tailwind CSS, Shadcn UI, Prisma ORM (dual PostgreSQL/SQLite compatibility), BullMQ / Inngest serverless event orchestration, and Upstash Redis distributed rate limiting.

### 5 Unfair Technical Moats
1. **7-Gate Pre-Send Deliverability Circuit Breaker**: 18 distinct atomic checks across 7 gates (`message_approved`, `lead_not_dnc`, `lead_not_blacklisted`, `email_not_dnc`, `lead_not_unsubscribed`, `valid_email`, `campaign_active`, `campaign_daily_limit`, `sender_exists`, `sender_active`, `sender_daily_limit`, `sender_reputation`, `domain_exists`, `domain_verified`, `domain_reputation`, `domain_daily_limit`, `domain_warmup_limit`, `domain_not_paused`) with 5-question structured UI remediation targets.
2. **Evidence-Backed Intent Signal Grounding**: Verifiable citation snapshots (`sourceUrl`, `sourceTitle`, `snippet`, `citationQuality`) preventing LLM hallucinations.
3. **Compounding Agent Memory**: Keystroke-level human edit tracking, kept phrase harvesting, and sentiment feedback loops that improve future copy generation.
4. **Zero-State-Loss Autonomy**: Workspace and campaign kill-switches halt execution in 1 cycle while preserving 100% of pending and scheduled outreach messages without drops or double-sends.
5. **Serverless Native Architecture**: Atomic Upstash Redis daily send counters with 25h TTL, dynamic $\pm 15\%$ ISP jitter, and serverless Inngest event functions.

---

## Feature Inventory

| # | Feature | Description | Milestone | Source | Status |
|---|---------|-------------|-----------|--------|:------:|
| 1 | Conversational Onboarding | Translates plain-English campaign goals into structured ICP parameters and 4-step sequence | M1 | R1 / POV 1 | DONE |
| 2 | Step-by-Step Onboarding Wizard | 4-step guided onboarding flow (Product, ICP, Domain, Autonomy) with progress persistence | M1 | R1 / POV 1 | DONE |
| 3 | Automated Prospect Discovery Feed | Autonomous feed surfacing qualified prospects without requiring manual CSV uploads | M2 | R2 / POV 1 | DONE |
| 4 | "Why Qualified" Research Cards | Intelligence card detailing trigger signal, ICP match breakdown, outreach angle, AI confidence score & MX gate | M2 | R2 / POV 1 | DONE |
| 5 | MX Email Verification Gate | Background MX record lookup ensuring prospect email delivers before queueing outreach | M2 | R2 / POV 1 | DONE |
| 6 | 5-Second Review Queue | High-velocity HITL review queue with keyboard shortcuts (A, R, E, G) and signal-to-draft preview | M3 | R3 / POV 1 | DONE |
| 7 | Bulk Message Approval | Batch approve high-scoring generated outreach messages with safety validation | M3 | R3 / POV 1 | DONE |
| 8 | 1-Click Autopilot Toggle | Autonomous background engine switch continuously discovering, qualifying, drafting, and dispatching | M3 | R3 / POV 1 | DONE |
| 9 | Dynamic 4-Step Sequences | Adaptive multi-touch sequence (Day 1 Initial, Day 3 Bump, Day 7 Value Case Study, Day 12 Breakup) | M4 | R4 / POV 2 | DONE |
| 10 | Real-Time Sequence Interruption | Automatically halts scheduled follow-ups upon recipient reply, meeting booking, or bounce | M4 | R4 / POV 2 | DONE |
| 11 | AI Smart Inbox (6 Categories) | 6-category reply classifier (`interested`, `meeting_request`, `question`, `not_interested`, `out_of_office`, `unsubscribe`) | M4 | R4 / POV 2 | DONE |
| 12 | Calendar Escalation Engine | Automatic meeting link generation and warm lead escalation for interested replies | M4 | R4 / POV 1 | DONE |
| 13 | Permanent Opt-Out Suppression | Immediate blacklist, DNC table insertion, and 0 future sends across all workspace campaigns | M4 | R4 / POV 2 | DONE |
| 14 | Sales Pipeline Command Center | Outcome-driven dashboard tracking Discovered -> Contacted -> Replied -> Interested -> Meeting Booked | M5 | R5 / POV 1 | DONE |
| 15 | Crystal-Clear Domain Setup | Unambiguous synchronized domain status badges (`ACTIVE / Verified` vs `PENDING DNS`) | M5 | R5 / POV 3 | DONE |
| 16 | Copyable DNS Helper Cards | SPF, DKIM, and DMARC copyable DNS records with 1-click clipboard integration | M5 | R5 / POV 3 | DONE |
| 17 | Agency Multi-Tenant Portal | Platform admin portal monitoring multi-client health, queues, and deliverability circuit breakers | M6 | R6 / POV 3 | DONE |
| 18 | Tenant Isolation & Cost Telemetry | Scoped multi-tenant queries, token consumption tracking, and estimated LLM costs | M6 | R6 / POV 3 | DONE |
| 19 | 4-Tier E2E Test Suite | Comprehensive opaque-box E2E test suite covering Tiers 1-4 for R1-R6 | M7 | AC / POV 1-3 | DONE |
| 20 | Unified Hardening Pipeline | Zero-regression test pipeline (`npm run typecheck` and `npm run test:hardening` 100% green) | M7 | AC / POV 3 | DONE |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|:------:|
| **E2E** | E2E Testing Track | 4-Tier Opaque-Box E2E Test Suite for R1-R6 (Tiers 1–4) | None | **DONE** |
| **M1** | Client Onboarding & Conversational Campaign Strategy | Goal-driven wizard, NLP goal-to-ICP translation, sequence template builder | None | **DONE** |
| **M2** | Automated Prospect Discovery & Research Cards | Discovery feed, "Why Qualified" intelligence cards, MX verification gate | M1 | **DONE** |
| **M3** | 5-Second Review Queue & Autopilot Engine | Fast HITL review queue, hotkeys, bulk approve, 1-click Autopilot background loop | M2 | **DONE** |
| **M4** | Dynamic Multi-Step Sequences & AI Smart Inbox | 4-step sequence scheduler, 6-category smart inbox, calendar booking escalation, permanent DNC suppression | M3 | **DONE** |
| **M5** | Outcome-Driven Dashboard & Domain Setup | Pipeline stages (Discovered->Meeting Booked), synchronized domain verification badges | M4 | **DONE** |
| **M6** | Agency Multi-Tenant Admin Separation | Multi-tenant admin portal, fleet health overview, LLM cost telemetry, strict isolation | M5 | **DONE** |
| **M7** | Final Integration & Full Test Hardening | 100% green `npm run typecheck` & `npm run test:hardening`, forensic audit CLEAN | E2E, M1-M6 | **DONE** |

---

## Interface Contracts

### 1. Conversational Onboarding Translation (`M1`)
- **Input**: `{ goalPrompt: string, valueProposition: string, organizationId: string }`
- **Output**: `{ icpCriteria: IcpCriteriaData, personas: PersonaData[], sequenceSteps: SequenceStepData[] }`

### 2. "Why Qualified" Intelligence Card (`M2`)
- **Input**: `{ leadId: string, organizationId: string }`
- **Output**: `{ triggerSignal: SignalSummary, icpMatchBreakdown: { firmographicScore: number, technographicScore: number, intentScore: number, mxScore: number, totalScore: number }, outreachAngle: string, aiConfidence: number, mxVerified: boolean }`

### 3. Review Queue Batch Actions (`M3`)
- **Input**: `{ action: "approve" | "reject" | "regenerate" | "bulk_approve", messageIds: string[], feedback?: string, organizationId: string }`
- **Output**: `{ processedCount: number, statuses: Record<string, string>, memoryUpdated: boolean }`

### 4. Smart Inbox 6-Category Classifier & Escalation (`M4`)
- **Input**: `{ replyText: string, messageId: string, leadId: string, organizationId: string }`
- **Output**: `{ category: "interested" | "meeting_request" | "question" | "not_interested" | "out_of_office" | "unsubscribe", confidence: number, nextAction: string, calendarLink?: string, suppressed: boolean }`

### 5. Sales Pipeline Funnel Aggregation (`M5`)
- **Input**: `{ organizationId: string, dateRange?: { start: Date, end: Date } }`
- **Output**: `{ discovered: number, contacted: number, replied: number, interested: number, meetingsBooked: number, positiveReplyRate: number }`

### 6. Agency Multi-Tenant Health Overview (`M6`)
- **Input**: `{ adminSession: SessionContext }`
- **Output**: `{ tenants: Array<{ id: string, name: string, activeCampaigns: number, deliverabilityScore: number, circuitBreakerStatus: string, tokenUsage: number, estimatedCost: number }>, fleetSummary: FleetStats }`

---

## Code Layout
- `src/app/onboarding/wizard/page.tsx`: 4-step client onboarding wizard.
- `src/app/api/onboarding/`: Onboarding step advance and complete endpoints.
- `src/components/dashboard/approval-queue.tsx`: 5-second HITL review queue with hotkeys and visual signal-to-draft flow.
- `src/components/dashboard/lead-score-breakdown.tsx`: "Why Qualified" intelligence research card.
- `src/components/dashboard/signal-intelligence-panel.tsx`: Signal intelligence feed and urgency breakdown.
- `src/components/dashboard/results-dashboard.tsx`: Sales pipeline command center with conversion funnel.
- `src/components/dashboard/domain-verifier.tsx`: Synchronized DNS verification checklist and copy helpers.
- `src/app/admin/page.tsx`: Agency Multi-Tenant Admin Operations portal.
- `src/lib/agents/`: Multi-agent pipeline (observe, think, act, reeval, infrastructure).
- `src/lib/deliverability/`: 7-gate send readiness, reputation tracker, warmup, cadence jitter, DNS checker.
- `src/lib/risk/`: Circuit breaker, spam keyword filter, pacing throttles.
- `src/__tests__/`: Comprehensive test suites across unit, integration, adversarial, concurrency, and E2E tiers.
