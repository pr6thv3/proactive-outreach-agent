# Proactive Outreach Agent (Signal-Driven Outreach Operating System)

An intelligent AI-powered sales outreach platform that automates lead discovery, signal intelligence, personalized email generation, and results tracking. Built with Next.js, TypeScript, Prisma, and Resend for production-grade email delivery.

## 💡 The Product Wedge
**“AI outbound that knows *why now*, not just *who* to email.”**

Instead of bulk email blasts or generic personalization, this platform leverages timely, cited buying signals to ensure outreach is relevant, contextual, and high-converting.

## 🎯 30-Day Beta Scope
The 30-day beta focuses on hardening a controlled **20-lead outreach loop**:
```
20 leads -> cited signals -> ranked top 5 -> AI drafts -> approval -> send-readiness -> safe send/block -> jobs/webhooks -> results loop
```
All broader features (Stripe billing, CRMs/calendars, Telegram/Slack integrations, LinkedIn automation, external enrichment vendors like Apollo/Hunter/Clay) are deferred and tracked in [BACKLOG.md](file:///C:/Users/Preethve/proactive-outreach-agent/BACKLOG.md).

## 🎯 What It Does

The Proactive Outreach Agent is a complete autonomous sales workflow engine that:

1. **Observes**: Discovers high-value signals (funding rounds, hiring spikes, job changes, product launches, traffic changes) from web scraped content and applies intelligent pain inference
2. **Thinks**: Generates highly personalized, signal-driven outreach emails with intelligent pitch angles and CTAs
3. **Acts**: Sends emails through production email infrastructure with domain warmup, reputation tracking, and deliverability monitoring
4. **Re-evaluates**: Classifies replies, learns from human feedback, and iteratively improves through agent memory
5. **Autonomy Loop**: Operates continuously with human-in-the-loop oversight via edit tracking and approval workflows

## 🌟 Key Features

### Signal Intelligence (The Core Moat)
- **16+ Signal Types**: funding_round, hiring_sdrs, job_change, traffic_drop, product_launch, growth, expansion, and more
- **Urgency Scoring**: Each signal has urgency (0-1) with decay rates and expiry windows
- **Pain Inference**: Automatically creates secondary signals from inferred pain points
- **Pitch Angle Intelligence**: Recommends tailored pitch angles based on signal type and persona

### Email Deliverability
- **Resend Integration**: Production-grade email sending with webhooks for real-time delivery tracking
- **Domain Warmup**: Automated 30-day warmup schedule (5→10→20→40→75→full sends)
- **DNS Verification**: SPF/DKIM/DMARC setup and verification via Resend API
- **Reputation Tracking**: Domain reputation score (0-100) based on bounce/complaint/open/click rates
- **Bounce Handling**: Hard bounces → DNC list, soft bounces → retry, complaints → immediate DNC
- **Open/Click Tracking**: Pixel-based open tracking and click redirect tracking with full attribution

### Results Dashboard
- **Signals → Emails → Replies → Meetings → Revenue**: Funnel view of campaign outcomes
- **Key Metrics**: Delivery rates, open rates, click rates, reply rates, positive reply %, conversion metrics
- **Daily Trends**: Reputation score tracking, delivery performance monitoring
- **Real-time Webhooks**: Resend events instantly update lead and campaign metrics

### Human-in-the-Loop Learning
- **Edit Tracking**: Captures all human edits to AI-generated emails with change magnitude analysis
- **Edit Classification**: Distinguishes between full rewrites, hook changes, CTA changes, and minor tweaks
- **Memory Feedback**: Converts edit insights into agent memory for future generations
- **Outcome Tracking**: Links edits to final email outcomes (replied, interested, bounced, etc.)
- **Kept Phrases Gold Standard**: Specifically tracks phrases humans keep (high-quality signal for learning)

### Multi-Phase Agent Architecture
- **Observe Phase**: Signal extraction with LLM + rule-based fallbacks
- **Think Phase**: Message generation with strategy, angle, tone, and CTA customization
- **Act Phase**: Email sending with channel support (email, LinkedIn, Twitter, SMS)
- **Re-Eval Phase**: Reply classification and outcome tracking
- **System & Autonomy**: Background jobs, memory management, and autonomous loop control

### Campaign Management
- **Multi-channel Support**: Email, LinkedIn, Twitter, SMS, contact form submissions
- **Lead Scoring**: Composite scoring (signal, spam risk, reply probability, conversion probability)
- **Autonomy Configuration**: Min lead score thresholds, max daily actions, autonomous scheduling
- **Follow-up Sequences**: Configurable multi-touch sequences (day 3, 7, 14, custom offsets)
- **Daily Send Limits**: Per-domain and per-campaign rate limiting with tracking

## 🏗️ Architecture

### Database (Prisma + SQLite/PostgreSQL)
- **Leads**: Core prospect data with enrichment fields, scoring, and autonomy tracking
- **Signals**: Extracted insights with urgency, reasoning, recommended pitch angles, and decay tracking
- **Campaigns**: Multi-channel campaigns with autonomy and channel configuration
- **OutreachMessages**: Generated emails with signal context and delivery tracking
- **EmailEvents**: Real-time webhook events (sent, delivered, bounced, opened, clicked, complained)
- **MessageEdits**: Human-in-the-loop learning with edit analysis
- **SendingDomains**: Domain management with DNS verification and reputation metrics
- **AgentMemory**: Compounding intelligence database of winning hooks, patterns, and correlations
- **JobQueue**: Background job system (scrape, signal_extract, score, generate, send, classify)

### Tech Stack

**Frontend**
- Next.js 16 (App Router)
- React 19 with TypeScript
- Tailwind CSS 4 with custom animations
- Radix UI components
- React Hook Form + Zod validation
- TanStack React Query for data fetching
- TanStack React Table for complex tables
- Framer Motion for animations
- MDX Editor for rich text editing
- Recharts for analytics visualization

**Backend**
- Next.js API Routes
- Prisma ORM (SQLite dev, PostgreSQL production)
- Resend for email delivery
- NextAuth for authentication (prepared for future)
- Zod for schema validation
- Zustand for state management
- next-intl for internationalization

**Infrastructure**
- Bun runtime (build and execution)
- Node environment variables with .env.example
- Logging with tee output redirection
- Production build with standalone server mode

### API Routes

**Campaign & Lead Management**
- `GET/POST /api/campaigns` - Campaign CRUD
- `GET/POST /api/leads` - Lead management
- `POST /api/leads/enrich` - Enrichment pipeline
- `POST /api/leads/score` - Lead scoring

**Email Generation & Sending**
- `POST /api/messages/generate` - AI email generation
- `POST /api/messages/approve` - Human approval workflow
- `POST /api/messages/send` - Queue for sending

**Deliverability Management**
- `GET/POST /api/domains` - Sending domain CRUD
- `POST /api/domains/verify` - DNS verification
- `GET /api/email-events` - Event tracking and aggregation
- `POST /api/stats` - Campaign and deliverability metrics

**Webhooks**
- `POST /api/webhooks/resend` - Resend event handling (sent, delivered, bounced, opened, clicked, complained)
- `POST /api/webhooks/resend/track` - Open pixel and click tracking

**Autonomous Pipeline**
- `POST /api/autonomous/discover` - Lead discovery
- `POST /api/autonomous/engage` - Autonomous campaign actions

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ or Bun 1.3+
- SQLite (dev) or PostgreSQL (production)
- Resend account with API key
- Verified sending domain

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/pr6thv3/proactive-outreach-agent.git
   cd proactive-outreach-agent
   ```

2. **Install dependencies**
   ```bash
   bun install
   # or npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local` with your values:
   - `DATABASE_URL`: SQLite path (dev) or PostgreSQL connection string
   - `RESEND_API_KEY`: Get from https://resend.com/api-keys
   - `RESEND_WEBHOOK_SECRET`: For webhook signature verification
   - `DEFAULT_SENDER_EMAIL`: Your sending domain email
   - `NEXT_PUBLIC_APP_URL`: Public URL for tracking links

4. **Set up database**
   ```bash
   bun db:generate
   bun db:push
   ```

5. **Start development server**
   ```bash
   bun dev
   ```
   Open http://localhost:3000

### Build for Production

```bash
bun build
bun start
```

This creates an optimized standalone server in `.next/standalone`.

## 📊 Database Schema Highlights

### Signals Table
```
- type: Signal classification (16+ types)
- urgency: 0-1 score indicating WHY outreach should happen NOW
- reasoning: LLM reasoning for the signal
- recommendedPitchAngle: e.g., "Growth partnership"
- recommendedOffer: Specific offer tailored to signal
- decayRate: How quickly urgency decreases per day
- expiresAt: When signal is no longer timely
```

### SendingDomain Table
```
- status: pending → verifying → verified
- warmupDay: 0-30 day warmup schedule
- warmupDailyLimit: Current send limit during warmup
- reputationScore: 0-100 based on delivery metrics
- DNS records: SPF, DKIM, DMARC verification status
```

### MessageEdit Table
```
- editType: full_rewrite, cta_changed, hook_changed, minor_edit, etc.
- changeMagnitude: 0-1 score of how much changed
- keptPhrases: JSON array of phrases human retained (GOLD signal)
- outcomeAfterEdit: Link to final email outcome
- fedToMemory: Whether this edit updated agent memory
```

## 🔄 Workflow Example

1. **Lead Created**: Manual import or autonomous discovery
2. **Signals Extracted**: Web scraper + LLM identifies funding round, hiring spike, etc.
3. **Scoring**: Lead score calculated based on signal quality and spam risk
4. **Email Generation**: AI generates subject/body using signal context and agent memory
5. **Human Review**: User edits email (captures feedback for learning)
6. **Approval**: User approves for sending
7. **Send**: Email queued through Resend with domain warmup compliance
8. **Tracking**: Real-time webhook updates on delivery, opens, clicks, replies
9. **Reply Classification**: AI classifies response (interested, neutral, negative, etc.)
10. **Memory Update**: Human edits and successful outcomes feed back into agent memory
11. **Autonomy**: Next lead automatically enters pipeline if autonomy enabled

## 📈 Metrics Tracked

- **Delivery**: Sent, Delivered, Bounced, Bounce Rate
- **Engagement**: Opened, Clicked, Open Rate, Click Rate
- **Response**: Replied, Positive Replies, Reply Rate, Conversion %
- **Reputation**: Score (0-100), Complaint Rate, Spam Risk
- **Campaign**: Email Generated, Approved %, Send Rate, Reply Rate, Meeting Rate
- **Pipeline Funnel**: Signals → Emails → Replies → Meetings → Revenue

## 🧠 Agent Memory System

Agent Memory stores learned patterns:
- **Category**: winning_hook, reply_rate, industry_pattern, persona_pattern, channel_effectiveness, offer_performance
- **Key**: Specific memory entry (e.g., "saas_vp_eng_professional")
- **Value**: JSON-serialized pattern data
- **Score**: Effectiveness (0-1)
- **Decay**: Freshness tracking with useCount and successCount

Memory is updated via:
- Human-in-the-loop edits (high-quality feedback)
- Reply classifications (outcome correlation)
- Campaign results (aggregate performance)

## 🛠️ Development Commands

```bash
# Development
bun dev              # Start dev server (port 3000)

# Database
bun db:generate      # Generate Prisma client
bun db:push          # Push schema to database
bun db:migrate       # Run migrations
bun db:reset         # Reset database

# Code Quality
bun lint             # Run ESLint

# Production
bun build            # Build for production
bun start            # Start production server
```

## 📝 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | SQLite path or PostgreSQL URL | ✅ |
| `RESEND_API_KEY` | Resend email service API key | ✅ |
| `RESEND_WEBHOOK_SECRET` | For verifying Resend webhooks | ✅ |
| `DEFAULT_SENDER_EMAIL` | Default from email address | ✅ |
| `DEFAULT_SENDER_NAME` | Default sender name | ✅ |
| `DEFAULT_REPLY_TO` | Default reply-to address | ✅ |
| `NEXT_PUBLIC_APP_URL` | Public app URL for tracking | ✅ |
| `NEXTAUTH_URL` | NextAuth URL (future) | ❌ |
| `NEXTAUTH_SECRET` | NextAuth secret (future) | ❌ |

## 🔐 Security Considerations

- Webhook signatures verified via RESEND_WEBHOOK_SECRET
- Never store raw API keys (use references instead)
- Email validation and spam risk scoring
- Do Not Contact list enforcement
- Hard bounce blacklisting
- Complaint handling with immediate DNC
- DMARC/SPF/DKIM verification for domain authenticity

## 🚦 Roadmap

- [ ] Multi-workspace support
- [ ] Advanced lead import (CSV, LinkedIn API, Apollo, Hunter)
- [ ] A/B testing for emails and landing pages
- [ ] Advanced reporting and BI dashboards
- [ ] Slack/Teams integration for notifications
- [ ] Calendar integration for meeting scheduling
- [ ] Voice outreach channel
- [ ] AI-powered reply drafts
- [ ] Compliance (CAN-SPAM, GDPR, CCPA)

## 📚 Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── (dashboard)/       # Main UI pages
│   ├── api/               # API routes (campaigns, leads, domains, webhooks)
│   └── layout.tsx         # Root layout
├── components/            # React components
│   ├── deliverability-panel.tsx
│   ├── results-dashboard.tsx
│   └── ...
├── lib/
│   ├── agents/           # Agent logic (observe, think, act, reeval)
│   ├── deliverability/   # Email delivery infrastructure
│   ├── db/               # Database utilities
│   └── utils.ts
└── prisma/
    └── schema.prisma     # Database schema
```

## 🤝 Contributing

This is an active development project. Contributions are welcome!

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit changes (`git commit -m 'Add your feature'`)
4. Push to branch (`git push origin feature/your-feature`)
5. Open a Pull Request

## 📄 License

MIT License - See LICENSE file for details

## 🙋 Support

For issues, questions, or suggestions:
- Open a GitHub Issue
- Check existing documentation in worklog.md
- Review Prisma schema for database structure details

---

**Built with ❤️ using Next.js, TypeScript, and modern AI/ML practices**
