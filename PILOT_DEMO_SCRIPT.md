# 3-Minute Pilot Demo Script

## Core Positioning Statement

> **This is not a cold email blaster. It is an AI outbound operator that finds _why now_, proves it with citations, and refuses to send when deliverability is unsafe.**

---

## Prerequisites

Before starting the demo:

1. Run `npm run db:push:sqlite && npm run db:seed` for clean seed data
2. Start the app: `npm run dev`
3. Open `http://localhost:3000`
4. Verify the **Demo Run** tab is visible

---

## Demo Flow (3 Minutes)

### [0:00 – 0:20] Lead Import

**Action**: Navigate to the **Demo Run** tab. Click **Import 20 Sample Leads**.

**Talk track**:
> "We start by importing 20 leads from a CSV — names, emails, companies, roles. Nothing special yet."

**Show**: Lead table populating with 20 rows. Point out that each lead has a trace ID logged.

**Key point**: "Every action from this point forward is traced end-to-end with a unique trace ID."

---

### [0:20 – 0:50] Cited Signals from Web Intelligence

**Action**: Click **Run Web Scraper & Enrichment**. Wait for completion. Switch to the **Intelligence** tab.

**Talk track**:
> "The system crawls each company's website — homepage, about, careers, blog, news — and extracts _why now_ signals. Funding rounds, hiring spikes, product launches, tech migrations."

**Show**:
- Signal Intelligence Panel with signal cards
- **Citation Quality Badges** (🟢 Strong, 🟡 Medium, 🔴 Weak)
- `sourceUrl` and `sourceTitle` visible on each signal
- Click a signal to see its source link

**Key point**: "Every signal is backed by a citation. We don't hallucinate urgency — we prove it."

---

### [0:50 – 1:10] Ranked Top 5 Opportunities

**Action**: Point to the ranked lead list, sorted by lead score.

**Talk track**:
> "The scoring engine combines signal urgency, decay rates, confidence, and role-based pain inference to rank the top 5 opportunities. These are the leads with the strongest _why now_."

**Show**:
- Lead scores (0-100)
- Priority tiers: Hot (≥70), Warm (≥40), Cold (<40)
- Top signal type and urgency displayed per lead

**Key point**: "The system picks the best 5 out of 20 automatically. No manual sorting."

---

### [1:10 – 1:40] AI Drafts with Evidence & Citations

**Action**: Click **Generate AI Drafts**. Switch to the **Approval Queue** tab. Click on a draft.

**Talk track**:
> "For each top 5 lead, the AI generates a personalized draft using the highest-urgency signal. But here's the key difference — every draft comes with an evidence snapshot."

**Show**:
- Draft card with subject and body
- **Evidence Snapshot** section:
  - Cited signals with `sourceUrl`, `sourceTitle`, `citationQuality`
  - Reasoning (why this pitch angle was chosen)
  - Risk Notes (warnings if only weak citations support factual claims)
- `traceId` visible in the debug/details section

**Key point**: "The user can verify every factual claim in the draft before approving. This is how we build trust."

---

### [1:40 – 2:00] Approve & Edit

**Action**: Click **Edit** on a draft. Change the subject line. Click **Approve**.

**Talk track**:
> "The user reviews, edits if needed, and approves. We track every edit — what was changed, the magnitude, which phrases were kept. This feeds back into the AI's memory so drafts improve over time."

**Show**:
- Edit modal with before/after
- Status changing from `generated` → `approved`
- Activity log entry showing the approval

**Key point**: "Approval-first, always. No email goes out without human sign-off."

---

### [2:00 – 2:20] Send-Readiness Validation

**Action**: Select the approved message. Click **Check Send Readiness**.

**Talk track**:
> "Before sending, the system runs a 20-point safety checklist. Approval state, blacklists, DNC lists, email validation, campaign limits, sender health, domain verification, DNS records, reputation scores, warmup limits, and Redis queue health."

**Show**:
- Send Readiness Checklist with green ✅ Pass indicators
- Each check showing its label, status, and reason
- `traceId` at the top of the checklist

**Key point**: "Every check must pass. One block and the send button is disabled."

---

### [2:20 – 2:35] Unsafe Send Blocked

**Action**: Show a pre-prepared blocked message (DNC lead or unverified domain).

**Talk track**:
> "Here's what happens when something is wrong. This lead is on the do-not-contact list. The system blocks the send and tells you exactly why, what to do about it, and the trace ID."

**Show**:
- Red 🔴 "Cannot send" status on the blocked check
- `reason`: "Lead is marked do-not-contact."
- `remediationTarget`: "lead_record"
- `traceId` visible

**Key point**: "No silent failures. The system tells you what happened, why, and what to do — every time."

---

### [2:35 – 2:50] Send Safe Email

**Action**: Go back to the approved message. Click **Send**.

**Talk track**:
> "For the safe message, we click Send. The job is enqueued, the worker picks it up, and the email goes out through Resend with full deliverability tracking."

**Show**:
- Job enqueued confirmation
- **Job Health** tab showing the running/completed job
- Message status changing to `sent`

---

### [2:50 – 3:00] Results & Real-Time Updates

**Action**: Switch to the **Results** tab. Show the dashboard.

**Talk track**:
> "Everything feeds into the Results dashboard. Signals found, emails generated, sent, delivered, bounced, replied. Real rates. Real metrics. When the Resend webhook fires, the dashboard updates automatically."

**Show**:
- Results funnel: Signals → Emails → Replies → Meetings → Revenue
- Delivery rate, bounce rate, reply rate
- Job Health panel with completed jobs

**Closing line**:
> "This is signal-driven outreach. Find _why now_, prove it, refuse to send when it's unsafe, and learn from every interaction. That's the product."

---

## Demo Environment Notes

| Setting | Value |
|---------|-------|
| Database | SQLite (local) or PostgreSQL (staging) |
| Auth | `AUTH_DEV_BYPASS=true` for demo |
| Email sending | Dry-run unless real `RESEND_API_KEY` is configured |
| Worker | Start with `npm run dev:worker` for real job processing |

## Troubleshooting

| Issue | Fix |
|-------|-----|
| No signals appear | Ensure `npm run db:seed` was run |
| Send button disabled | Check send-readiness; ensure domain status is `verified` |
| Jobs stuck in pending | Start the worker: `npm run dev:worker` |
| Dashboard empty | Click the Refresh button or run `npm run db:seed` |
