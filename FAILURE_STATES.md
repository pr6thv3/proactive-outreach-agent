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

---

## 8. Missing Sender Identity

- **Symptom**: No sender account is attached to a campaign or workspace pool, or all pooled senders have been deleted or deactivated.
- **Handling**:
  - `evaluateSendReadiness` flags the absence of eligible active senders as a `sender_exists` block.
  - The orchestrator refuses to process the send, returning a structured `Cannot send` response.
  - The Approval Queue UI displays a red "Blocked" indicator with the reason "No sender is available for this workspace/campaign."
- **Recovery**:
  - Navigate to the Deliverability panel and create or reactivate at least one `SenderAccount` with `status: 'active'`.
  - Ensure the sender is linked to a verified `SendingDomain`.

---

## 9. Unapproved Draft

- **Symptom**: A message is still in `generated` or `draft` status and someone attempts to send it.
- **Handling**:
  - The `evaluateSendReadiness` evaluator checks `message.status === 'approved'` via the `message_approved` check.
  - If the message is not approved, the check returns a `block` outcome with the current status value.
  - The send button is disabled in the UI, and the API returns a structured error.
- **Recovery**:
  - Open the Approval Queue, review the draft, optionally edit it, and click **Approve**.
  - Only `generated` or `draft` messages can transition to `approved`.

---

## 10. Webhook Delay / Async Processing Lag

- **Symptom**: A Resend webhook event arrives but the corresponding dashboard update is delayed.
- **Handling**:
  - Webhook events are enqueued as `webhook-processing` background jobs to avoid API timeout constraints.
  - If Redis is offline, the job is saved to the database with `queued_without_redis: true`.
  - The Job Health panel shows the webhook processing job in the pending queue.
- **Recovery**:
  - Ensure the worker process is running (`npm run worker`).
  - Check the Job Health dashboard for pending webhook-processing jobs.
  - Webhook jobs are processed in order; a temporary delay is expected under high load.

---

## 11. Failed Job

- **Symptom**: A background job (send-email, scrape, etc.) fails after exhausting retry attempts.
- **Handling**:
  - The worker records the error message and full structured result in the `JobQueue` record.
  - Failed jobs are cataloged with `status: 'failed'` and include the `error` field, `traceId`, and `attempt` count.
  - The Job Health panel surfaces failed job counts and their error messages.
- **Recovery**:
  - Review the job's `error` field and `traceId` to diagnose the root cause.
  - Common causes: Resend API rate limiting (429), network timeouts, invalid recipient.
  - Manually reset the job status to `pending` to retry, or address the underlying issue and re-trigger.

---

## 12. Stale Running Job

- **Symptom**: A background job remains in `running` status for longer than 15 minutes without completing.
- **Handling**:
  - The Job Health endpoint calculates job age from `startedAt` and flags jobs older than 15 minutes as stale.
  - The `worker_queue_health` readiness check emits a `warn` status when stale running jobs are detected.
  - The UI displays the stale count and oldest job age in the Job Health panel.
- **Recovery**:
  - Check if the worker process is alive and responsive.
  - Review the stale job's `traceId` in application logs.
  - If the worker crashed, restart it — the job will remain in `running` state until manually reset to `pending` or marked `failed`.

---

## UI 5-Question Checklist

Every failure state must produce a UI response that clearly answers these 5 questions:

| # | Question | Where to find the answer |
|---|----------|--------------------------|
| 1 | **What happened?** | The `label` and `reason` fields on the readiness check, or the `error` field on a failed job |
| 2 | **Is sending blocked or only warned?** | The `status` field: `block` = cannot send, `warn` = can send with review |
| 3 | **Why?** | The `reason` field provides a human-readable explanation |
| 4 | **What should the user do next?** | The `remediationTarget` field points to the relevant UI panel (`lead_record`, `deliverability`, `campaign_settings`, `worker`, `job_health`, `approval_queue`) |
| 5 | **What is the traceId?** | The `traceId` field on the readiness result, job record, or API response |

**No silent failures are allowed.** If a failure state does not produce answers to all 5 questions, it is a bug.

