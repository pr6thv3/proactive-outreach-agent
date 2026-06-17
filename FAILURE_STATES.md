# Resilience Guide: Failure States & Recovery Playbooks

This guide documents the design patterns, test coverage, and recovery playbooks for potential failure states within the Proactive Outreach Agent infrastructure.

---

## 1. Redis Offline / Connection Failures

- **Symptom**: The Redis server is unreachable, crashed, or misconfigured.
- **Handling**:
  - The application intercepts Redis client connection failures gracefully.
  - Job enqueuing delegates to the `JobQueue` database table fallback, outputting a warning in logs and setting `{ queued_without_redis: true }` in responses.
  - The Job Health endpoint reports `redis.connected = false` and exposes the exact error string in the UI without crashing the client interface.
- **Verification Command**:
  - Shut down or stop your local Redis service (or set an invalid `REDIS_URL` like `redis://localhost:9999`) and attempt to enqueue a send. Verify the job is created in the database and does not raise an unhandled exception.

---

## 2. Worker Stopped / Dead Queues

- **Symptom**: The worker process terminates, but jobs continue to be enqueued.
- **Handling**:
  - Jobs remain in a `pending` status in the `JobQueue` table (or BullMQ queue).
  - The **Job Health** dashboard lists pending job counts and tracks the `oldestPendingJobAgeMs` to highlight worker inactivity.
  - No messages are sent until the worker is restarted.
- **Recovery**:
  - Restart the worker process using `npm run worker` (or `bun run worker`).
  - Upon starting, the worker picks up pending jobs in chronological order.

---

## 3. Unverified Sending Domain

- **Symptom**: An outreach message is approved, but its sending domain lacks verified SPF/DKIM/DMARC records.
- **Handling**:
  - The shared `send-readiness` evaluator checks `domain.status === 'verified'`.
  - If unverified, the check fails with a `block` outcome, preventing the send button from triggering.
  - The worker processor re-checks readiness before sending and aborts, moving the job to `failed` to prevent unauthorized send actions.
- **Recovery**:
  - Verify DNS setup in the Resend dashboard or trigger a re-check via `POST /api/domains/verify`.

---

## 4. Missing Sender

- **Symptom**: No sender account is attached to a campaign or workspace pool, or all pooled senders are inactive.
- **Handling**:
  - `evaluateSendReadiness` flags the absence of eligible active senders as a `block`.
  - The orchestrator blocks sending and returns a descriptive error.
- **Recovery**:
  - Navigate to Deliverability settings and verify that at least one `SenderAccount` has `status: 'active'` and is mapped to a verified `SendingDomain`.

---

## 5. Bounced Email or Spam Complaint

- **Symptom**: An email bounces or a complaint is logged by the recipient.
- **Handling**:
  - The Resend webhook handles the event and delegates to `src/lib/deliverability/bounce-handler.ts`.
  - The lead status is immediately changed to `blacklisted`, their email is added to the `DoNotContact` database table, and sending is halted.
- **Verification**:
  - Run the test suite (`npm run test`) to ensure the bounce handler and DNC checks block future sends.

---

## 6. Stale or Dead Jobs

- **Symptom**: A background job gets stuck in `running` status or continuously fails and gets dead-lettered.
- **Handling**:
  - Stale jobs are flagged if they remain in `running` status for longer than 15 minutes without progress.
  - Dead jobs (max retries exceeded) are cataloged as `dead` in the database.
  - Both conditions trigger warnings on the Job Health panel.
- **Recovery**:
  - Review job logs via the recent jobs trace log.
  - Manually reset the status of stale/dead jobs to `pending` to retry, or purge them from the database.

---

## 7. Daily Send Limit Reached

- **Symptom**: A domain or sender account hits its daily send quota.
- **Handling**:
  - The shared `send-readiness` evaluator checks `sender.sentToday >= sender.dailyLimit` and `domain.dailySendsCount >= domain.dailyLimit` for the current day.
  - If the limit has been reached, the readiness evaluator blocks sending with a `daily_limit` block check.
  - The message is held in the approval queue/draft state and cannot be sent until the daily count resets.
- **Recovery / Testing**:
  - Daily counts reset automatically at midnight UTC when the date changes (`YYYY-MM-DD`).
  - For testing/simulation, manually update the date or count in the database to trigger/bypass the block.
