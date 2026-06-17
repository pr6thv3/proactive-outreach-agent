# Demo Walkthrough: 20-Lead Outreach Loop

Follow this guide to demonstrate the end-to-end controlled 30-Day Beta outreach workflow.

## 🛠️ Step 1: Local Setup & Database Reset

1. **Verify Environment Variables**:
   Ensure your `.env.local` contains:
   ```bash
   SQLITE_DATABASE_URL="file:./dev.db"
   AUTH_DEV_BYPASS="true"
   ```

2. **Reset and Seed the SQLite Database**:
   Run the following commands to get a clean database with the required seed data (including test organizations, sending domains, and sender accounts):
   ```bash
   npm run db:push:sqlite
   npm run db:seed
   ```

3. **Start the Application**:
   ```bash
   npm run dev
   ```
   Open your browser to [http://localhost:3000](http://localhost:3000).

---

## 📥 Step 2: Lead Import (20 Leads)

1. Navigate to the **Autonomous Loop** or **Leads** panel in the dashboard.
2. Click **Import CSV** or select the **Import 20 Sample Leads** option in the Demo Run interface.
3. This triggers a `traceId` which will be logged throughout the workflow.
4. Verify that exactly 20 leads are imported into the lead list.

---

## 🔍 Step 3: Run Cited Web Enrichment & Ranking

1. Click **Run Web Scraper & Enrichment** on the Demo interface.
2. The scraper runs to extract signals from company websites (`/about`, `/careers`, `/blog`, `/news`).
3. View the **Signal Intelligence Panel** to verify that citations (`sourceUrl` and `sourceTitle`) and **Citation Quality Badges** (`strong`, `medium`, `weak`) are visible.
4. The system automatically ranks the leads, surfacing the **Top 5 leads** with the highest signal urgency scores.

---

## 📝 Step 4: Generate & Review AI Drafts

1. Click **Generate AI Drafts** to trigger the THINK phase for the top 5 leads.
2. The AI drafts customized email copy using the highest urgency signals.
3. Open the **Approval Queue** and click on a draft to inspect the **Evidence Snapshot**:
   - Verify that the cited signals are listed alongside their `sourceUrl` and `sourceTitle`.
   - Check the **Risk Notes** block which warns if only weak or inferred citations were used to drive factual claims.
   - Verify that the `traceId` is visible in the debug/details section of the draft card.

---

## ✏️ Step 5: Edit and Approve Messages

1. Click **Edit** on an AI draft to make a modification (e.g., changing the subject line or adding a sentence).
2. Click **Approve**.
3. In the database, this logs the change magnitude, original content, and edited content in `MessageEdit` to feed back into the Agent Memory system.
4. The message status shifts to `approved` and the lead status shifts to `approved`.

---

## 🚦 Step 6: Evaluate Send-Readiness & Send

1. Select the approved message in the **Approval Queue**.
2. Examine the **Send Readiness Checklist**:
   - The checklist displays pass/warn/block checks for approval state, blacklist, DNC, email validation, campaign limits, sender limits, domain verification, reputation scores, and Redis connection.
3. Verify that:
   - If a domain is unverified or a lead is on DNC, the send button is blocked.
   - If Redis is offline but all other checks pass, the status is "Can queue, but review first" (with `queued_without_redis: true` visible).
4. Click **Send** for a ready message.
5. Watch the **Job Health** and **Results Dashboard** update in real-time as the job is processed, showing the incremented `sentEmails` metric!

---

## 🛑 Step 7: Failure-State Simulation Checklist

Run these scenarios to verify system resilience and safety guards:

### 1. Redis Offline Fallback
- **Simulation**: Stop your local Redis service or temporarily delete the `REDIS_URL` line in `.env.local`, then restart the app.
- **Verification**: Try sending a message. The app must fallback to database queuing. Verify that `queued_without_redis: true` is returned in the API response, the Job Health panel displays a warning banner, and the job is saved to the `JobQueue` table in `pending` state.

### 2. Safety Block - Do-Not-Contact (DNC) or Blacklist
- **Simulation**: Edit a lead and set `doNotContact: true` or `isBlacklisted: true`.
- **Verification**: Go to the Approval Queue for this lead's draft. The safety report must show a red "Blocked" status for `lead_not_dnc` or `lead_not_blacklisted` and the overall status should prevent sending.

### 3. Deliverability Block - Unverified Domain
- **Simulation**: Manually update a sending domain's status to `pending` in the database:
  ```bash
  npx prisma db execute --stdin "UPDATE SendingDomain SET status = 'pending';"
  ```
- **Verification**: Try to run a safety report. It must return a red "Blocked" status for `domain_verified`, preventing email dispatch.

### 4. Warmup Daily Limit Block
- **Simulation**: Set the daily sends count for a domain or sender to match its daily limit:
  ```bash
  npx prisma db execute --stdin "UPDATE SendingDomain SET dailySendsCount = dailyLimit;"
  ```
- **Verification**: The send-readiness check must flag the daily limit check as a block, safeguarding domain reputation.

