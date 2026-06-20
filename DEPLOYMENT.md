# Production & Staging Deployment Guide

This guide details the steps required to deploy the Proactive Outreach Agent to production/staging environments (Next.js Standalone App + Background Worker).

---

## 🏗️ 1. Infrastructure Requirements

- **Application Hosting**: Any platform supporting Next.js Standalone (e.g., Railway, Render, Fly.io, Vercel).
- **Database**: PostgreSQL (v14+) database with `pgvector` extension enabled.
- **Cache / Job Broker**: Redis (v6+) database for BullMQ background queues.
- **Email Delivery**: Resend account with a verified sending domain.

---

## 🔑 2. Required Environment Variables

Ensure the following variables are configured in your hosting platform. For detailed instructions on how to obtain these keys, see [STAGING_REQUIRED_VARS.md](file:///C:/Users/Preethve/proactive-outreach-agent/STAGING_REQUIRED_VARS.md):

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
AUTH_DEV_BYPASS=false
```

---

## 🛠️ 3. Deployment Commands

### Build Phase
To compile the standalone server and prepare static assets, execute the build command:
```bash
npm run build
```
This runs `next build` followed by a post-build asset copying script (`node scripts/copy-standalone-assets.mjs`).

### Run Phase (Web Process)
To start the Next.js frontend and API route handler:
```bash
node .next/standalone/server.js
```
*(Or if your platform uses Procfile, it will auto-detect the `web` process)*

### Run Phase (Worker Process)
To start the persistent BullMQ background queue consumer:
```bash
npm run worker
```
*(Or if your platform uses Procfile, it will auto-detect the `worker` process)*

---

## 🗄️ 4. Database Setup & Migration

Before launching the web or worker processes, run the database migrations:

```bash
npx prisma migrate deploy
npx prisma generate
```

---

## 📬 5. Resend Email & Webhook Setup

### Custom Domain DNS Configuration
1. In your **Resend Dashboard**, navigate to **Domains** > **Add Domain**.
2. Add your outreach subdomain (e.g., `outbound.yourcompany.com`).
3. Add the generated DNS records to your domain provider:
   - **SPF (TXT)**: Auth policies for sender validation.
   - **DKIM (TXT)**: Cryptographic signature to authenticate origin.
   - **DMARC (TXT)**: Rejection/quarantine policies.
   - **MX**: Inbound mail routing.
4. Verify domain status. Ensure it reads **Verified** in Resend before sending.

### Webhook Event Handling
1. In the **Resend Dashboard**, go to **Webhooks** > **Add Webhook**.
2. Set Endpoint URL to: `https://<your-app-domain>/api/webhooks/resend`
3. Select the following events:
   - `email.sent`
   - `email.delivered`
   - `email.bounced`
   - `email.complained`
4. Copy the webhook signing secret (starts with `whsec_`) and save it as `RESEND_WEBHOOK_SECRET` in your server's environment variables.

---

## 🩺 6. Monitoring & Health Check Endpoints

- **Web Server Health**: Standard Next.js server requests.
- **Job Health API**: `GET /api/jobs/health`
  - Returns real-time connection status to Redis, active/pending/failed job counts per queue, and stale job warnings.
  - Useful for wire-up to platform uptime monitors (e.g., Railway or Render TCP/HTTP checks).

