# ProactiveReach — Production & Deployment Runbook

Complete deployment manual and operational runbook for the **ProactiveReach Autonomous AI SDR Platform** (Next.js 16 Standalone Web + BullMQ Background Worker).

---

## 📋 Table of Contents

1. [Architecture Overview](#-1-architecture-overview)
2. [Prerequisites & System Requirements](#-2-prerequisites--system-requirements)
3. [Environment Configuration Reference](#-3-environment-configuration-reference)
4. [Local Zero-to-Working Runbook](#-4-local-zero-to-working-runbook)
5. [Docker & Containerized Production Runbook](#-5-docker--containerized-production-runbook)
6. [Linux VPS Production Runbook (Ubuntu 22.04 / 24.04 LTS)](#-6-linux-vps-production-runbook-ubuntu-2204--2404-lts)
7. [Cloud PaaS Deployments (Railway / Render / Fly.io / Vercel)](#-7-cloud-paas-deployments)
8. [Domain, DNS & Deliverability Configuration (Resend)](#-8-domain-dns--deliverability-configuration-resend)
9. [Health Checks, Monitoring & Troubleshooting](#-9-health-checks-monitoring--troubleshooting)

---

## 🏗️ 1. Architecture Overview

ProactiveReach consists of two primary runtime processes and two infrastructure dependencies:

```
                          ┌──────────────────────────┐
                          │   Reverse Proxy / CDN    │
                          │   (Nginx / Caddy / Cloud)│
                          └─────────────┬────────────┘
                                        │ HTTPS (Port 443)
                                        ▼
    ┌────────────────────────────────────────────────────────────────────────┐
    │                      Next.js Web Application (Port 3000)               │
    │  - App Router UI & React Server Components                             │
    │  - NextAuth.js v5 Session & RBAC Middleware                            │
    │  - API Route Handlers (CAS claims, rate limiters, webhooks)            │
    └──────────────────┬───────────────────────────────┬─────────────────────┘
                       │                               │
                       ▼                               ▼
    ┌──────────────────────────────────┐   ┌─────────────────────────────────┐
    │     PostgreSQL Database (v14+)   │   │       Redis 7+ (BullMQ Broker)  │
    │  - Universal tenant isolation    │   │  - Asynchronous lead queues     │
    │  - Outreach state & audit logs   │   │  - Distributed rate limiters    │
    └──────────────────▲───────────────┘   └─────────────────▲───────────────┘
                       │                                     │
                       └───────────────────┬─────────────────┘
                                           │
    ┌──────────────────────────────────────┴─────────────────────────────────┐
    │                   BullMQ Background Worker Process                     │
    │  - 4-phase SDR agent loops (Observe → Think → Act → Re-Eval)           │
    │  - 7-gate deliverability circuit breakers                              │
    │  - Multi-tiered enrichment engine (Format → MX → Handshake)            │
    └────────────────────────────────────────────────────────────────────────┘
```

---

## 💻 2. Prerequisites & System Requirements

| Component | Minimum Specification | Recommended Production |
| :--- | :--- | :--- |
| **Node.js** | v20.x LTS | v20.18+ or v22.x LTS |
| **Operating System** | Linux (Ubuntu / Debian / Alpine) or macOS | Ubuntu 22.04 / 24.04 LTS |
| **Compute / Memory** | 1 vCPU, 1 GB RAM | 2 vCPU, 4 GB RAM |
| **Database** | SQLite (Local Dev) / PostgreSQL 14+ | Managed PostgreSQL 15+ (e.g. Supabase, Neon, AWS RDS) |
| **Cache / Queue** | In-Memory fallback (Local Dev) | Redis 7+ (Self-hosted or Upstash Redis) |
| **Email Service** | Local Mock Sender (`providerId: local_only`) | Resend Account with verified sending domain |

---

## 🔑 3. Environment Configuration Reference

Copy `.env.example` to `.env` to configure your instance.

### Required in Production
| Variable | Description | Example / Method |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/proactive_outreach` |
| `NEXTAUTH_SECRET` | 256-bit cryptographic secret for JWT & cookies | `openssl rand -base64 32` |
| `REDIS_URL` | Redis connection URL for BullMQ queues | `redis://localhost:6379` |
| `RESEND_WEBHOOK_SECRET` | Signing secret for Resend delivery/bounce webhooks | `whsec_xxxxxxxxxxxx` |

### Core Outbound & Operational
| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_BASE_URL` | Canonical public origin | `https://outreach.yourdomain.com` |
| `NEXTAUTH_URL` | NextAuth canonical URL | `https://outreach.yourdomain.com` |
| `RESEND_API_KEY` | Resend API key for outbound emails | `re_xxxxxxxxxxxx` |
| `DEFAULT_SENDER_EMAIL` | Default outbound mailbox identity | `alex@outbound.yourdomain.com` |
| `DEFAULT_SENDER_NAME` | Default sender display name | `Alex from Acme` |
| `DEFAULT_REPLY_TO` | Inbound replies destination | `replies@yourdomain.com` |
| `CRON_SECRET` | Secret token guarding scheduled automation routes | `openssl rand -hex 24` |
| `AUTH_DEV_BYPASS` | Development auth bypass (`true`/`false`) | `false` in production |

### AI & Embeddings (Optional)
| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `OPENAI_API_KEY` | OpenAI API key for copy generation & reasoning | `sk-proj-xxxxxxxxxxxx` |
| `EMBEDDING_PROVIDER` | Semantic embedding provider | `openai` |
| `EMBEDDING_MODEL` | Text embedding model | `text-embedding-3-small` |

---

## 🚀 4. Local Zero-to-Working Runbook

For rapid local evaluation, testing, or offline demoing without setting up PostgreSQL or Redis:

```bash
# 1. Clone the repository
git clone https://github.com/your-org/proactive-outreach-agent.git
cd proactive-outreach-agent

# 2. Run the automated one-command setup
npm run setup
# Or explicitly with flags:
# bash scripts/setup.sh --sqlite --seed

# 3. Start the web application
npm run dev

# 4. Start the background worker in a second terminal
npm run worker
```

- Web UI is accessible at: `http://localhost:3000`
- Seeded test accounts:
  - **Owner**: `owner@acme.com` / `password123`
  - **Sales**: `bob@acme.com` / `password123`

---

## 🐳 5. Docker & Containerized Production Runbook

The repository includes a production multi-stage `Dockerfile` and a 4-service `docker-compose.yml` (`web`, `worker`, `postgres`, `redis`).

### 1. Build and Boot Entire Cluster
```bash
# 1. Ensure .env is populated with your secrets
cp .env.example .env
# Edit .env and set NEXTAUTH_SECRET, RESEND_API_KEY, etc.

# 2. Start all services in the background
docker compose up -d --build

# 3. Check service health
docker compose ps
```

### 2. Push Database Schema & Seed (First Run)
```bash
# Run migrations inside the web container
docker compose exec web npx prisma migrate deploy

# (Optional) Seed demo workspace and sample prospects
docker compose exec web npm run db:seed
```

### 3. Monitoring & Logs
```bash
# Stream live application logs
docker compose logs -f web worker

# View queue and database connection health
curl http://localhost:3000/api/jobs/health
```

### 4. Stopping & Teardown
```bash
# Stop containers while preserving data volumes
docker compose down

# Stop and remove persistent data volumes (destructive)
docker compose down -v
```

---

## 🖥️ 6. Linux VPS Production Runbook (Ubuntu 22.04 / 24.04 LTS)

Follow this step-by-step runbook to provision a high-performance, bare-metal or cloud VM (DigitalOcean, Hetzner, AWS EC2, Linode).

### Step 1: System Package Update & Node.js 20 LTS Installation
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ufw build-essential libpq-dev

# Install Node.js 20 LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify versions
node -v # Should be v20.x or higher
npm -v  # Should be v10.x or higher
```

### Step 2: Install and Secure PostgreSQL
```bash
sudo apt install -y postgresql postgresql-contrib

# Start and enable PostgreSQL service
sudo systemctl enable postgresql
sudo systemctl start postgresql

# Create proactive outreach database and dedicated role
sudo -u postgres psql -c "CREATE DATABASE proactive_outreach;"
sudo -u postgres psql -c "CREATE USER proactive_user WITH ENCRYPTED PASSWORD 'ReplaceWithStrongDbPassword';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE proactive_outreach TO proactive_user;"
sudo -u postgres psql -c "ALTER DATABASE proactive_outreach OWNER TO proactive_user;"
```

### Step 3: Install and Secure Redis
```bash
sudo apt install -y redis-server

# Enable systemd supervision in Redis
sudo sed -i 's/^supervised no/supervised systemd/' /etc/redis/redis.conf

# Restart and enable Redis
sudo systemctl restart redis.service
sudo systemctl enable redis.service

# Verify connection
redis-cli ping # Should respond PONG
```

### Step 4: Clone Repository and Configure Environment
```bash
# Create application directory
sudo mkdir -p /var/www/proactive-outreach
sudo chown -R $USER:$USER /var/www/proactive-outreach
cd /var/www/proactive-outreach

# Clone project code
git clone https://github.com/your-org/proactive-outreach-agent.git .

# Install dependencies
npm ci

# Configure production .env
cp .env.example .env
nano .env
```

Ensure `.env` contains your production settings:
```bash
DATABASE_URL="postgresql://proactive_user:ReplaceWithStrongDbPassword@localhost:5432/proactive_outreach"
REDIS_URL="redis://localhost:6379"
NEXTAUTH_SECRET="<output from openssl rand -base64 32>"
NEXTAUTH_URL="https://outreach.yourdomain.com"
NEXT_PUBLIC_BASE_URL="https://outreach.yourdomain.com"
AUTH_DEV_BYPASS="false"
NODE_ENV="production"
```

### Step 5: Database Migration & Production Build
```bash
# Deploy database migrations
npx prisma migrate deploy
npx prisma generate

# Compile Next.js standalone application
npm run build
```

### Step 6: Process Management via PM2
Install PM2 globally to supervise the Web and Worker processes:
```bash
sudo npm install -g pm2

# Create ecosystem.config.js
cat << 'PM2_EOF' > ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'proactive-web',
      script: '.next/standalone/server.js',
      cwd: '/var/www/proactive-outreach',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        PORT: 3000,
        NODE_ENV: 'production',
      },
    },
    {
      name: 'proactive-worker',
      script: 'node_modules/.bin/tsx',
      args: 'scripts/worker.ts',
      cwd: '/var/www/proactive-outreach',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
PM2_EOF

# Start PM2 applications
pm2 start ecosystem.config.js

# Save PM2 state and configure systemd autostart on reboot
pm2 save
pm2 startup
```

### Step 7: Reverse Proxy & Automatic SSL (Caddy or Nginx)

#### Option A: Caddy (Recommended — Automatic HTTPS & Zero-Config SSL)
```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy -y

# Configure /etc/caddy/Caddyfile
sudo cat << 'CADDY_EOF' > /etc/caddy/Caddyfile
outreach.yourdomain.com {
    reverse_proxy 127.0.0.1:3000
    encode gzip zstd
}
CADDY_EOF

sudo systemctl reload caddy
```

#### Option B: Nginx + Certbot
```bash
sudo apt install -y nginx certbot python3-certbot-nginx

sudo cat << 'NGINX_EOF' > /etc/nginx/sites-available/proactive-outreach
server {
    server_name outreach.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX_EOF

sudo ln -s /etc/nginx/sites-available/proactive-outreach /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Obtain SSL Certificate
sudo certbot --nginx -d outreach.yourdomain.com
```

### Step 8: Configure Firewall (UFW)
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https
sudo ufw enable
```

---

## ☁️ 7. Cloud PaaS Deployments

### Railway / Render / Fly.io
1. Create a **PostgreSQL** database and a **Redis** instance.
2. Deploy the web service from GitHub:
   - **Build Command**: `npm run build`
   - **Start Command**: `node .next/standalone/server.js`
   - Add environment variables from `.env.example`.
3. Deploy a second service for the background worker:
   - **Build Command**: `npm ci`
   - **Start Command**: `npm run worker`
   - Add the same `DATABASE_URL` and `REDIS_URL`.

### Vercel (Web Serverless Frontend)
1. Import repository to Vercel.
2. Set Environment Variables: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `REDIS_URL`, `CRON_SECRET`.
3. Configure **Vercel Cron** in `vercel.json` to trigger scheduled automation:
   ```json
   {
     "crons": [
       {
         "path": "/api/cron/agent-orchestrator",
         "schedule": "*/15 * * * *"
       }
     ]
   }
   ```
4. Run the persistent BullMQ worker on a companion worker service (e.g. Railway or Render) connecting to the same Redis instance.

---

## 📬 8. Domain, DNS & Deliverability Configuration (Resend)

Live outbound email delivery requires establishing cryptographic domain authentication.

### DNS Records Setup
In your domain registrar (Cloudflare, Route53, Namecheap, Google Domains):

| Type | Name / Host | Value / Target | Purpose |
| :--- | :--- | :--- | :--- |
| **TXT** | `outbound.yourdomain.com` | `v=spf1 include:amazonses.com ~all` | SPF: Authorizes Resend IP addresses |
| **TXT** | `resend._domainkey.outbound` | `k=rsa; p=<public-key>` | DKIM: Cryptographic outbound signature |
| **TXT** | `_dmarc.outbound` | `v=DMARC1; p=quarantine; pct=100;` | DMARC: Rejection/quarantine policy |
| **MX** | `outbound.yourdomain.com` | `feedback-smtp.us-east-1.amazonses.com` (Priority 10) | Inbound deliverability bounces |

### Inbound Webhook Registration
1. In the **Resend Dashboard**, navigate to **Webhooks** > **Add Webhook**.
2. **Endpoint URL**: `https://outreach.yourdomain.com/api/webhooks/resend`
3. **Events to subscribe**:
   - `email.sent`
   - `email.delivered`
   - `email.bounced`
   - `email.complained`
4. Copy the webhook signing secret (starts with `whsec_`) and assign it to `RESEND_WEBHOOK_SECRET` in `.env`.

---

## 🩺 9. Health Checks, Monitoring & Troubleshooting

### System Health Endpoints
- **Job Health API**: `GET /api/jobs/health`
  - Returns connection state to Redis, active/waiting/failed job counts across all BullMQ queues.
- **Autonomy Status API**: `GET /api/autonomy/status`
  - Returns current autonomy killswitch state, daily quota utilization, and rolling bounce metrics.

### Verification CLI Commands
```bash
# Verify environment variable schema compliance
npm run db:validate

# Verify TypeScript type safety
npm run typecheck

# Run full production readiness & security test suite
npm run test:hardening
```

### Common Troubleshooting Scenarios

| Issue | Root Cause | Solution |
| :--- | :--- | :--- |
| **`Missing production environment variables`** | `NODE_ENV=production` without required secrets | Verify `DATABASE_URL`, `NEXTAUTH_SECRET`, `REDIS_URL`, and `RESEND_WEBHOOK_SECRET` in `.env`. |
| **`Redis connection refused`** | Redis daemon inactive or wrong `REDIS_URL` | Check `sudo systemctl status redis` or test with `redis-cli ping`. |
| **`Database connection timeout`** | Firewall blocking port 5432 or incorrect credentials | Verify PostgreSQL is listening on `localhost:5432` and `pg_hba.conf` allows the user. |
| **`Resend 403 Forbidden on outbound email`** | Attempting to send to external leads using sandbox sender | Set `DEFAULT_SENDER_EMAIL` to a verified custom domain, or upgrade out of Resend free sandbox. |
| **`Jobs stuck in queued_without_redis`** | Worker started without Redis | Connect Redis via `REDIS_URL` and launch `npm run worker` to drain queued tasks. |
