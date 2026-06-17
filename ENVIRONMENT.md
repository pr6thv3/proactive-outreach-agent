# Environment Configuration Guide

This document defines the configuration parameters and environment variables required to run the Proactive Outreach Agent in development, testing, and production environments.

## Environment Variables (.env.local)

Create a `.env.local` file at the repository root by copying `.env.example`:

```bash
cp .env.example .env.local
```

### 🗄️ Database Variables

#### `DATABASE_URL`
- **Description**: The connection string for the main database (PostgreSQL in production/staging).
- **Format**: `postgresql://username:password@host:port/database?schema=public`
- **Required**: Yes (for production/staging builds).

#### `SQLITE_DATABASE_URL`
- **Description**: Path to the local SQLite database file, used for offline testing and local development.
- **Format**: `file:./dev.db`
- **Required**: Optional (fallback when testing locally via `db:*:sqlite` scripts).

---

### 📬 Deliverability Variables

#### `RESEND_API_KEY`
- **Description**: API key obtained from the Resend dashboard (`re_...`) for sending emails and managing domains.
- **Required**: Yes (except during dry-runs or when `RESEND_API_KEY` is omitted, which triggers a local mock fallback).

#### `RESEND_WEBHOOK_SECRET`
- **Description**: Secret signature key to verify incoming Resend webhook events (delivered, bounced, complained, opened, clicked).
- **Required**: Yes, to securely process webhook payloads.

#### `DEFAULT_SENDER_EMAIL`
- **Description**: Fallback email address to use if no campaign or domain sender is resolved.
- **Required**: Yes.

#### `DEFAULT_SENDER_NAME`
- **Description**: Fallback name prefix for email sending.
- **Required**: Yes.

#### `DEFAULT_REPLY_TO`
- **Description**: Fallback Reply-To header value.
- **Required**: Yes.

---

### 🔑 Authentication Variables (Clerk)

#### `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- **Description**: Clerk frontend client key.
- **Required**: Yes (for Clerk authentication).

#### `CLERK_SECRET_KEY`
- **Description**: Clerk backend secret key.
- **Required**: Yes.

#### `AUTH_DEV_BYPASS`
- **Description**: Bypasses Clerk authentication constraints during local testing or SQLite execution, mapping actions to a mock user and organization.
- **Value**: `true` or `false`
- **Required**: No (recommend `true` for local SQLite development and test suites).

---

### 🤖 AI & Embeddings Variables

#### `OPENAI_API_KEY`
- **Description**: Key for OpenAI services used for LLM drafting and optional vector search.
- **Required**: Yes, if using OpenAI.

#### `EMBEDDING_PROVIDER`
- **Description**: Vector provider for embedding generation (e.g., `openai`).
- **Required**: Optional.

#### `EMBEDDING_MODEL`
- **Description**: Model to generate text embeddings (e.g., `text-embedding-3-small`).
- **Required**: Optional.

---

### 🌐 System Variables

#### `NEXT_PUBLIC_BASE_URL`
- **Description**: Base URL of the application, used to construct absolute links for email open-tracking pixels, click-tracking redirects, and Resend webhook registrations.
- **Required**: Yes.

#### `REDIS_URL`
- **Description**: Redis server connection string used by the BullMQ worker for background job processing.
- **Format**: `redis://:password@host:port`
- **Required**: Yes, to start BullMQ queues (if Redis is not configured or offline, the system falls back to a database-only mock queue, setting `queued_without_redis: true`).
