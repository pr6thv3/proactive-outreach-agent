# Production Deployment Guide

This guide details the steps required to deploy the Proactive Outreach Agent to production (Next.js Standalone + Background Worker).

## 🏗️ 1. Infrastructure Requirements

- **Application Hosting**: Next.js App Router (e.g., Vercel, Railway, Fly.io, or Render).
- **Database**: PostgreSQL database.
- **Cache / Job Broker**: Redis (required for BullMQ background workers).
- **Email Delivery Service**: Resend (configured with verified domain records).

---

## 🗄️ 2. Database Migration

Before deploying code updates, apply database changes to the production database:

1. Ensure the production environment variables (`DATABASE_URL`) are exported.
2. Run Prisma migration commands:
   ```bash
   npx prisma migrate deploy
   ```
3. Generate the Prisma Client:
   ```bash
   npx prisma generate
   ```

---

## 📦 3. Build the Application

Build the Next.js app for production. The build output is configured to use **Standalone Server Mode** (generating a minimal server footprint inside `.next/standalone`):

```bash
npm run build
```

This command:
1. Compiles the React/Next.js routes and assets.
2. Copies standing assets to `.next/standalone/public` and `.next/standalone/.next/static` via `scripts/copy-standalone-assets.mjs`.

---

## 🚀 4. Run the Standalone Web Server

Start the standalone web server in your production environment:

```bash
PORT=3000 node .next/standalone/server.js
```

Ensure all required production environment variables (documented in [ENVIRONMENT.md](file:///C:/Users/Preethve/proactive-outreach-agent/ENVIRONMENT.md)) are provided to this process.

---

## ⚙️ 5. Run the Background Worker

The background worker must run as a separate, persistent daemon alongside the main Next.js web application:

```bash
npm run worker
```

- This starts the worker processor (`scripts/worker.ts` via `tsx`) which listens to BullMQ queues.
- Ensure the worker has access to both `DATABASE_URL` and `REDIS_URL`.
- In a platform like Railway or Render, deploy the repository twice:
  1. Once as a **Web Service** running `node .next/standalone/server.js`.
  2. Once as a **Background worker/Worker Service** running `npm run worker`.
