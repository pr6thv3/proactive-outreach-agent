# Backlog: Post-Beta Features

This file contains features and integrations that are out of scope for the 30-Day Beta (the controlled 20-lead outreach loop) and are deferred for subsequent implementation.

## Excluded Items

### 💳 Billing & Subscriptions
- Integration with Stripe or other payment gateways for SaaS plans and subscription lifecycle events (trialing, active, past due, canceled).
- Metered usage billing based on emails sent or AI tokens consumed.

### 🔌 CRM & Calendar Sync
- Full two-way CRM sync (Salesforce, HubSpot, Pipedrive).
- Direct calendar booking integrations (Calendly, Cal.com) for meetings booked tracking (currently captured via reply classification escalation).

### 💬 Chat & Notification Channels
- Telegram bot integration for alerts or direct administration.
- Slack notifications for lead actions or job status updates.
- Teams notifications or workspace event alerts.

### 🤖 LinkedIn & Social Channel Automation
- Direct LinkedIn automation (auto-connecting, profile visits, message sequencing, DM crawling).
- Twitter (X) automated outreach and direct message monitoring.
- *Note: Existing schema fields (e.g. Campaign.linkedinEnabled, twitterEnabled, etc.) are preserved in the database for roadmap compatibility but are disabled/hidden in the beta UI.*

### 🔍 Third-Party Lead Enrichment Vendors
- Apollo API integration for lead prospecting.
- Hunter.io email verification or discovery API.
- Clay integration for custom data pipelines.

### 📈 Multi-channel Sequences
- Advanced multi-channel sequences containing SMS, LinkedIn touches, and email in a single unified flow.
- Conditional sequencing branching based on social engagement metrics.

### 🌐 Public Marketing & Landing Pages
- Marketing website or product landing page.
- Self-serve onboarding flows for new signups.

### 🏢 Advanced Agency Portal
- Multi-tenant dashboard for agencies managing multiple client organizations from a single login.
- White-label DNS setups and domain routing configurations.
