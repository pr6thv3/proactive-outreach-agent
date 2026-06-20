# Pilot Program — 3-User Beta Validation

## Program Goal

Validate the core hypothesis: **Do users trust the evidence enough to approve the draft without significant edits?**

If users trust the evidence, the product has a defensible differentiator over generic cold email tools.

---

## Ideal Pilot Profiles

Onboard only 3 pilot users, selected from these personas:

### 1. Founder-Led B2B SaaS Seller
- **Profile**: Solo founder or 2-person GTM team at a seed/Series A B2B SaaS company.
- **Current workflow**: Manually researching prospects, writing cold emails in Gmail/Apollo, sending < 50 emails/week.
- **Pain**: Research takes 30+ minutes per prospect. Generic templates get low reply rates.
- **Validation signal**: Do they trust the cited signals enough to approve drafts quickly? Do they reduce research time?
- **Expected outcome**: 5-10 approved sends per week, measurable reduction in draft editing.

### 2. Small Lead-Generation Agency
- **Profile**: 3-10 person agency managing outbound for 2-5 B2B clients.
- **Current workflow**: Using Apollo, Hunter, or Instantly for prospecting and sending. Manual enrichment for top accounts.
- **Pain**: High volume but low personalization. Client complaints about generic emails and poor reply rates.
- **Validation signal**: Do they trust the system's signal quality over their manual research? Does citation quality reduce client pushback?
- **Expected outcome**: Uses signal intelligence to prioritize top accounts per client. Citation evidence improves client approval rates.

### 3. GTM Operator (Currently Manual)
- **Profile**: RevOps or SDR leader at a 20-100 person company.
- **Current workflow**: Using Clay for enrichment, Apollo/Outreach for sequences, manual review of top accounts.
- **Pain**: Too many tools, context-switching, and manual steps between enrichment and sending.
- **Validation signal**: Does the unified loop (import → signal → draft → approve → send) save time vs. their current multi-tool stack?
- **Expected outcome**: Uses the platform as a single pane for their top 20 accounts per week.

---

## Onboarding Checklist (Per Pilot User)

### Pre-Onboarding (Before First Session)
- [ ] Pilot user has a verified email domain (SPF, DKIM, DMARC configured)
- [ ] Pilot user has a Resend account (or we provision one)
- [ ] DNS records verified in Resend dashboard
- [ ] Clerk organization created for the pilot user
- [ ] `.env.local` configured with pilot user's credentials
- [ ] Database migrated and seeded

### First Session (30 Minutes)
- [ ] Walk through the 3-minute demo together
- [ ] Import the pilot user's real lead list (up to 20 leads)
- [ ] Run enrichment and review cited signals together
- [ ] Generate drafts and review evidence snapshots together
- [ ] Approve/edit one draft together
- [ ] Run send-readiness check and explain each check
- [ ] Send one real email (if domain is verified and ready)
- [ ] Show Job Health and Results dashboard

### Post-Session
- [ ] Pilot user has login credentials
- [ ] Pilot user knows how to import leads
- [ ] Pilot user knows how to review and approve drafts
- [ ] Pilot user knows where to find the Results dashboard
- [ ] Pilot user knows how to contact support (email/Slack/Telegram)

---

## Success Metrics — What to Track

### Primary Metric
**Draft approval rate without significant edits** = (drafts approved with minor or no edits) / (total drafts generated)

Target: > 60% approval without significant edits

### Secondary Metrics

| Metric | How to Measure | Target |
|--------|----------------|--------|
| Leads imported | `Lead` count per org | ≥ 20 per pilot per week |
| Signals discovered | `Signal` count per org | ≥ 2 per lead average |
| Top-5 lead quality | User feedback (1-5 scale) | ≥ 3.5 average |
| Draft approval rate | Approved / Generated | ≥ 70% |
| Average edit volume | `MessageEdit` change magnitude | ≤ 30% body rewrite |
| Send-readiness blocks triggered | `block` checks per org | Track frequency, review root causes |
| Bounce rate | Bounced / Sent | < 3% |
| Reply rate | Replied / Sent | > 5% |
| Positive reply rate | Interested / Replied | > 40% |
| Meetings booked | Manual tracking or reply classification escalation | ≥ 1 per pilot per week |
| User trust in citations | User feedback (1-5 scale) | ≥ 3.5 average |

### Data Collection
- Metrics are automatically tracked in the database (leads, signals, messages, edits, events)
- Weekly pull of key metrics via the Stats API (`GET /api/stats`)
- User feedback collected via a simple weekly check-in (email or Slack message)

---

## Feedback Collection Cadence

| Touchpoint | Frequency | Format |
|------------|-----------|--------|
| Onboarding session | Once (Day 0) | 30-minute video call |
| Quick check-in | Day 3 | 5-minute async message |
| Weekly review | Weekly (Day 7, 14, 21, 28) | 15-minute call + metrics review |
| Exit interview | End of 30 days | 30-minute video call |

### Weekly Check-In Questions
1. How many leads did you import this week?
2. Did the signal intelligence surface useful signals? Which types were most valuable?
3. How many drafts did you approve without major edits?
4. Did you encounter any blocked sends? Were the reasons clear?
5. Any bugs, confusion, or frustration points?
6. On a scale of 1-5, how much do you trust the cited evidence?

---

## Escalation & Support Plan

| Severity | Response Time | Channel |
|----------|--------------|---------|
| App crashes / data loss | < 1 hour | Direct message (Slack/Telegram/Email) |
| Send blocked unexpectedly | < 4 hours | Direct message |
| UI confusion / copy issues | < 24 hours | Email thread |
| Feature requests | Logged to BACKLOG.md | Weekly review |

### Support Boundaries
- We fix bugs and improve copy/UX clarity during the pilot.
- We do **not** build new features during the pilot (feature freeze is active).
- Feature requests are documented in `BACKLOG.md` for post-pilot prioritization.

---

## Pilot Timeline

| Week | Focus |
|------|-------|
| Week 0 | Staging validation, failure-state QA, infrastructure setup |
| Week 1 | Onboard Pilot User #1, first sends, initial feedback |
| Week 2 | Onboard Pilot Users #2 and #3, collect Week 1 metrics from User #1 |
| Week 3 | All 3 pilots active, weekly metrics review, bug fixes |
| Week 4 | Final metrics pull, exit interviews, Go/No-Go assessment |

---

## Go / No-Go Criteria

### Go
- ≥ 2 of 3 pilot users completed the full loop (import → signals → drafts → approve → send)
- Draft approval rate without significant edits ≥ 60%
- Bounce rate < 3%
- No critical blockers or data loss incidents
- Users rate citation trust ≥ 3.5/5

### No-Go
- Pilot users consistently rewrite >50% of drafts (signal quality insufficient)
- Bounce rate > 5% (deliverability infrastructure issues)
- Critical bugs prevent the core loop from completing
- Users don't trust the evidence and resort to manual research anyway
