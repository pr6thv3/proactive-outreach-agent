# Staging Required Variables

Staging validation requires connecting to real external services and infrastructure. If you do not have staging credentials, this guide documents the necessary environment variables and how to provision them.

> [!WARNING]
> **Current Status**: Staging execution is **blocked by missing external credentials**.
> Local validation using SQLite, dev auth bypass (`AUTH_DEV_BYPASS=true`), and automated test suites (`test:staging`, `test:failure-qa`) have been fully verified and pass locally. However, deployment and verification against live staging resources cannot proceed until the variables below are provided in `.env.local`.

---

## 🔑 Required Staging Environment Variables

| Variable Name | Description | Resource Provider | How to Obtain / Configuration |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection URL. Required for transactional database storage. | Postgres Provider (e.g., Supabase, Neon, AWS RDS) | Provision a PostgreSQL instance. Set the connection string format: `postgresql://<user>:<password>@<host>:<port>/<dbname>?sslmode=require` |
| `REDIS_URL` | Redis connection URL. Required for BullMQ job queues and rate limits. | Redis Provider (e.g., Upstash, Redis Labs, Aiven) | Provision a Redis instance. Set the connection string format: `rediss://default:<password>@<host>:<port>` |
| `RESEND_API_KEY` | API Key for email sending and tracking. | [Resend](https://resend.com) | Create a Resend account. Go to Settings > API Keys, and generate a new key. |
| `RESEND_WEBHOOK_SECRET` | Secret key used to verify SVIX signatures on inbound mail events. | [Resend Webhooks](https://resend.com/webhooks) | Set up a webhook pointing to `https://<your-staging-url>/api/webhooks/resend`. Resend will display the endpoint signing secret prefixing `whsec_`. |
| `NEXT_PUBLIC_BASE_URL` | Public HTTPS endpoint of your web service. Required for unsubscribe links and webhook tracking. | App Hosting Platform (e.g., Railway, Render, Fly.io) | Use your staging service domain, e.g., `https://proactive-outreach-staging.up.railway.app` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Frontend publishable key for user authentication. | [Clerk](https://clerk.com) | Create a Clerk application. Go to API Keys in the dashboard and select the Publishable Key. |
| `CLERK_SECRET_KEY` | Backend secret key for user authentication. | [Clerk](https://clerk.com) | Go to API Keys in the Clerk dashboard and copy the Secret Key. |
| `DEFAULT_SENDER_EMAIL` | Default verified email from which to send outreach messages. | Resend / Custom Domain | Must match your verified domain in Resend (e.g., `alex@outbound.yourdomain.com`). |
| `DEFAULT_SENDER_NAME` | Default sender name shown on outreach emails. | Workspace Config | A string of your choice (e.g., `Alex from OutreachOS`). |
| `DEFAULT_REPLY_TO` | Default email address where replies will be directed. | Workspace Config | Any valid email address (e.g., `replies@yourdomain.com`). |
| `OPENAI_API_KEY` | API Key for LLM draft generation and scoring. | [OpenAI](https://platform.openai.com) | Create an OpenAI API account and generate a key from the API Keys dashboard. |

---

## 🛠️ Step-by-Step Staging Setup Guide

### 1. Database & Migrations
1. Once `DATABASE_URL` is set, run the database migrations:
   ```bash
   npm run db:push
   npm run db:generate
   ```

### 2. BullMQ Background Worker
1. Ensure `REDIS_URL` is set.
2. In staging, the worker must run in a separate process/container using the command:
   ```bash
   npm run worker
   ```

### 3. DNS & Domain Verification (Resend)
1. Add your sending domain (e.g., `outbound.yourdomain.com`) in the Resend dashboard under **Domains**.
2. Configure your DNS provider with the generated **MX, SPF, DKIM, and DMARC** records.
3. Wait for Resend to verify the status. Do not use unverified domains in outreach queues.

### 4. Clerk Webhooks & Auths
1. Set up Clerk backend keys (`CLERK_SECRET_KEY`) and ensure interactive paths redirect through Clerk.
2. Set `AUTH_DEV_BYPASS=false` in staging to ensure authentications are enforced.
