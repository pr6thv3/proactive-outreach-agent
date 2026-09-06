# Comprehensive Multi-Persona Friction Audit: ProactiveReach AI Outreach Platform

**Milestone**: M1 (R1 & R2) — Multi-Persona End-to-End Simulation & Friction Audit  
**Author**: worker_orch8_m1  
**Date**: 2026-09-06  
**Target Codebase**: ProactiveReach Autonomous AI SDR (`proactive-outreach-agent`)  
**Status**: Authoritative Reference Document  

---

## Executive Summary

This document presents the complete findings of an exhaustive, multi-persona simulation of the ProactiveReach Autonomous AI SDR platform. Four distinct real-world personas were modeled and simulated end-to-end against the running application architecture:
1. **Persona 1: First-Time Non-Technical Sales Manager** (evaluating ease of setup, NLP goal translation, sample data, review queue velocity, and autopilot autonomy).
2. **Persona 2: Technical Operator & System Administrator** (evaluating DNS records verification, secondary sending domains, cryptographic webhook signatures, multi-tenant workspace switching, API keys, and production configuration).
3. **Persona 3: Edge-Case & Chaos User** (evaluating malformed RFC 4180 CSV imports, missing fields, formula injections, rapid consecutive clicks, and concurrent queue dispatches).
4. **Persona 4: Adverse Environment & Reliability Auditor** (evaluating third-party provider timeouts, unconfigured Resend credentials, sandbox restrictions, disposable domains, hard bounces, and emergency stop killswitches).

While ProactiveReach possesses an exceptionally strong architectural core — featuring a 7-gate deliverability circuit breaker, atomic Compare-And-Swap (CAS) send claiming, compounding agent memory, and natural language goal translation — our simulation uncovered **16 concrete friction points**. These range from critical UI-backend disconnects (such as an inoperable emergency pause killswitch caused by a schema property mismatch and silent loss of custom email edits in the review queue) to configuration traps that crash production deployments.

Every friction point is documented using the rigorous 6-component format:  
`Observed problem → Underlying cause → Why current design creates it → Simplest better design → Implementation changes → Validation method`.

---

## Simulation Personas

### Persona 1: First-Time Non-Technical Sales Manager
- **Identity**: Sarah Chen, VP of Sales at a fast-growing B2B SaaS startup.
- **Context**: Wants to launch an outbound prospecting campaign in under 10 minutes. Has zero technical knowledge of DNS, MX records, API keys, or webhooks. Relies on natural language prompts, rich empty states, 1-click sample data, intuitive review queues, and reliable autopilot transitions.
- **Key Frustrations**: Cryptic technical jargon, disconnect between setup wizard and dashboard status, buttons that appear to succeed but silently do nothing, losing customized email copy.

### Persona 2: Technical Operator & System Administrator
- **Identity**: Devon Miller, Lead DevOps & Growth Infrastructure Engineer.
- **Context**: Responsible for configuring multiple custom sending domains, verifying SPF/DKIM/DMARC records, securing inbound/outbound webhooks with cryptographic signatures, managing multi-tenant client workspaces, and ensuring production deployability via Docker and environment validation.
- **Key Frustrations**: Ghost environment dependencies, workspace switchers that return 405 Method Not Allowed, permission errors that mask as network or propagation delays, undocumented environment variables.

### Persona 3: Edge-Case & Chaos User
- **Identity**: Jordan Cruz, RevOps Specialist with real-world, dirty CRM exports.
- **Context**: Uploads messy CSV files exported from HubSpot, Salesforce, and Apollo with quoted commas, missing fields, foreign characters, and duplicate headers. Tends to double-click buttons and mash keyboard shortcuts (`A`, `E`, `R`).
- **Key Frustrations**: CSV parser breaking on valid quoted commas (`"Acme, Inc."`), forms lacking double-submit protection resulting in duplicate database records, unhandled re-entrancy in hotkey handlers.

### Persona 4: Adverse Environment & Reliability Auditor
- **Identity**: Morgan Vance, Security & Compliance Lead conducting adverse operational drills.
- **Context**: Evaluates system behavior during simulated network timeouts, unconfigured email providers, restricted Resend sandbox modes, disposable email inputs, sudden hard bounce spikes, and emergency stop scenarios.
- **Key Frustrations**: Emergency stop killswitch returning 400 validation error during critical incidents, fake "Sent" confirmations when email providers are not configured, lack of clear UI warnings in restricted sandbox modes.

---

## End-to-End Persona Simulation Walkthroughs

### Walkthrough 1: Non-Technical Sales Manager Journey
1. **Account Creation & Wizard Launch**:
   - Sarah registers at `/auth/signup` and is routed into `/onboarding/wizard`.
   - **Step 1 (Goal Prompt)**: Sarah inputs a natural language goal: *"Target VP of Sales and CROs at Series A/B fintech companies with 50-200 employees who are hiring SDRs. Pitch our AI meeting assistant."* Clicks **Translate Goal with AI**. The translation engine (`goal-translator.ts`) accurately populates target industries (`Fintech`, `Financial Services`), company size (50-200), hiring signals, and a tailored 4-step sequence. Sarah is delighted.
   - **Step 2 (Strategy Review)**: Sarah inspects the personas and sequence steps. Everything looks grounded and professional.
   - **Step 3 (Sending Domain)**: Sarah enters `outreach.acmesaas.com`, `Sarah from Acme`, and `sarah@outreach.acmesaas.com`. The UI shows a high-level DNS helper card with SPF, DKIM, and DMARC summaries. Sarah clicks Next. A `SendingDomain` is created in `pending` status.
   - **Step 4 (Autonomy & Launch)**: Sarah sets daily limit to 50, score threshold to 60, enables autonomy, and clicks **Complete Setup & Launch Campaign**. The wizard displays a toast *"Onboarding complete! Campaign initialized."* and redirects to `/dashboard`.
2. **Dashboard Reality vs Expectation Gap**:
   - On `/dashboard`, Sarah expects outbound outreach to start immediately. However, the sending domain created in Step 3 is `pending` (unverified). The 7-gate deliverability circuit breaker silently blocks all dispatches because SPF/DKIM/DMARC are not verified. Sarah has no idea that outreach is blocked or that she must ask her IT team to add DNS records.
3. **Empty States & Sample Data Seeding**:
   - Sarah navigates to `/dashboard/leads`. She sees the designed empty state and clicks **Load Sample High-Intent Data**.
   - `POST /api/seed-sample` populates 5 high-conviction leads (Sarah Jenkins @ Plaid, Marcus Vance @ Stripe, etc.) with intent signals.
   - Sarah is excited and navigates to `/dashboard/review` to try the 5-Second Review Queue.
   - **Friction**: The review queue is empty! `POST /api/seed-sample` created `Lead` and `Signal` rows, but zero `OutreachMessage` rows. Sarah must know to navigate to `/dashboard/leads` or trigger discovery to generate draft emails.
4. **5-Second Review Queue & Copy Discard Bug**:
   - Once draft emails exist, Sarah reviews the first prospect (Sarah Jenkins).
   - Sarah notices the transparent copy explanation showing why the hiring signal was injected. She presses `E` to enter inline edit mode and polishes the opening sentence: *"Saw Plaid just opened 6 new SDR roles on LinkedIn."*
   - Sarah presses `A` to approve. The UI shows toast: *"Approved outreach for Sarah Jenkins!"*
   - **Critical Failure**: The inline edit was permanently discarded! The review queue sent the edits to `/api/leads/[id]/approve`, which does not exist (404). The fallback endpoint (`PATCH /api/leads/[id]` and `POST /api/messages/batch`) ignores `subject` and `body`. Sarah's customized copy was lost and the raw AI draft was dispatched.
5. **Autopilot Toggle Desync**:
   - Sarah clicks the **Autopilot Mode** toggle in the review queue header. A toast confirms: *"🚀 Autopilot Mode Activated!"*
   - Sarah refreshes the page or navigates to `/dashboard`. Autopilot is back to Review Mode. The toggle only mutated ephemeral React `useState`, leaving `UserPreference.autonomyEnabled` in the database untouched.

---

### Walkthrough 2: Technical Operator Journey
1. **Secondary Sending Domain Setup & Verification**:
   - Devon logs in to configure a secondary sending domain (`apex-outreach.io`) at `/dashboard/domains`.
   - Devon inputs domain name, from name, and from email. Clicks **Add Domain**.
   - The UI returns required DNS records (SPF TXT, DKIM CNAME, DMARC TXT) with 1-click copy buttons.
   - Devon configures the records in Cloudflare DNS, waits 60 seconds, and clicks **Verify DNS**.
   - If Devon is logged in as an invited team member with role `MEMBER` rather than `ADMIN`, `src/app/api/sending-domains/[id]/verify/route.ts` rejects the request with HTTP 403. The UI toast displays: *"DNS records pending propagation. Please check registrar settings."*, falsely attributing the failure to DNS propagation rather than insufficient user permissions.
2. **Multi-Tenant Workspace Switching Hazard**:
   - Devon oversees multiple isolated client organizations (`Acme SaaS Corp` and `Apex Security Labs`).
   - Devon clicks the workspace selector dropdown in the top navigation header (`header.tsx`) and selects `Apex Security Labs`.
   - A success toast announces: *"Switched active workspace to Apex Security Labs"*.
   - **Hazard**: Devon navigates to `/dashboard/leads` and begins importing leads. Unbeknownst to Devon, the workspace switcher issued `PATCH /api/preferences` with `{ activeOrgId: "org_apex" }`. Because `/api/preferences` only implements `GET` and `POST`, Next.js returned HTTP 405 Method Not Allowed. The frontend swallowed the error with `.catch(() => null)` without reloading the page or updating the NextAuth session. All new leads and campaigns were created inside `Acme SaaS Corp` instead of `Apex Security Labs`, causing severe cross-tenant confusion.
3. **Production Deployment & Ghost Environment Crash**:
   - Devon prepares a production deployment on an Ubuntu Linux server with PostgreSQL and Redis.
   - Following `.env.example`, Devon configures `DATABASE_URL`, `NEXTAUTH_SECRET`, `RESEND_API_KEY`, and `UPSTASH_REDIS_REST_URL`.
   - Devon sets `NODE_ENV=production` and runs `npm run worker`.
   - **Immediate Crash**: `src/lib/env.ts` throws:
     `Error: Missing production environment variables: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY`.
   - Devon is baffled. The codebase uses NextAuth v5, but `src/lib/env.ts` has leftover production validation rules demanding Clerk credentials that the application does not use. Furthermore, BullMQ worker fails to connect because `REDIS_URL` was omitted from `.env.example`.

---

### Walkthrough 3: Edge-Case User Journey
1. **RFC 4180 CSV Lead Import (Quoted Commas)**:
   - Jordan imports a standard CRM CSV export into `/dashboard/leads/import`:
     ```csv
     name,email,company,title
     "Sarah Jenkins, VP",sarah@plaid.com,"Plaid, Inc.","VP, Sales"
     "Marcus Vance",marcus@stripe.com,"Stripe, LLC","Director of RevOps"
     ```
   - Jordan clicks **Parse & Queue Enrichment**.
   - **Parsing Failure**: `src/lib/safety.ts:253` splits each row using `rawLine.split(',')`.
   - On row 1, `"Sarah Jenkins` and `VP"` become columns 0 and 1. Column 2 is `sarah@plaid.com`. The header mapping expected `email` at index 1, which is now `"VP"`.
   - The parser attempts `validateEmail("VP")`, fails, and reports: `Row 2: Invalid email: Invalid characters in email domain`. Valid prospective leads are rejected.
2. **Double-Click Form Submission & Race Conditions**:
   - In the CSV import modal (`csv-import-dialog.tsx`), Jordan pastes 20 leads and rapidly clicks the **Import** button three times.
   - The dialog lacks an `isSubmitting` / disabled state. Three concurrent POST requests are sent to `/api/orchestrate`.
   - Fortunately, the underlying orchestrator uses database-level upserts for leads, but three separate activity audit logs are created and UI toast notifications overlap chaotically.
3. **Review Queue Hotkey Re-Entrancy**:
   - In `/dashboard/review`, Jordan rapidly taps `A` four times in quick succession.
   - `handleApprove()` lacks an entry-level `if (isPersisting) return;` guard. Four parallel approval cycles fire before React's state update finishes, triggering duplicate API calls to `/api/messages/batch`.

---

### Walkthrough 4: Adverse Environment & Reliability Auditor Journey
1. **Emergency Stop Killswitch Failure**:
   - Morgan simulates a runaway outbound incident where bad copy was drafted.
   - Morgan navigates immediately to `/dashboard/autonomy` and clicks **Pause Outreach Agent**.
   - Morgan expects background SDR dispatches to freeze instantly.
   - **Catastrophic Failure**: The UI displays toast error: *"Failed to toggle autonomy state."* The agent remains active and continues dispatching.
   - **Underlying Cause**: `autonomy-panel.tsx:104` sends `{ pause: true }`. The backend schema in `src/app/api/autonomy/pause/route.ts:8` requires `{ paused: z.boolean() }`. Zod rejects the payload with HTTP 400 (`validation_error: Expected boolean, received undefined at "paused"`). In an emergency, the killswitch is completely broken from the UI.
2. **Silent "Sent" False Positives with Unconfigured Resend**:
   - Morgan tests the application in a local staging environment where `RESEND_API_KEY` is deliberately left unset.
   - Morgan approves an email in `/dashboard/review`.
   - The UI displays: *"Approved outreach for Sarah Jenkins! Dispatched via 7-step deliverability gate."*
   - In `/dashboard/leads`, the message status updates to `SENT`.
   - **False Positive**: No email was actually sent. `src/lib/deliverability/index.ts:107-123` marks the message as `sent` in SQLite with `providerId: 'local_only'`. There is no visual warning or banner on `/dashboard` or `/dashboard/review` informing the user that emails are only mocked locally. A sales manager would believe hundreds of leads were contacted when zero reached recipient inboxes.
3. **Resend Free Sandbox Restrictions**:
   - When running with default `onboarding@resend.dev`, Resend blocks all outbound emails to external domains, permitting delivery only to the verified account owner (`preethve.b@gmail.com`).
   - Dispatches fail at the Resend API with HTTP 403. The system retries 3 times with exponential backoff before setting status `FAILED`.
   - The dashboard does not provide a proactive banner alerting the user that their domain is in sandbox mode, leaving users confused about why their messages are failing.

---

## Comprehensive 6-Component Friction Point Audit

```
Format:
Observed problem → Underlying cause → Why current design creates it → Simplest better design → Implementation changes → Validation method
```

### FP-1: Review Queue Inline Edits Dropped Upon Approval
- **Observed problem**: A sales manager reviews an outreach draft in `/dashboard/review`, presses `E`, customizes the subject line and email body, and presses `A` to approve. The draft is dispatched using the original AI-generated text; all user edits are silently lost.
- **Underlying cause**: `handleApprove()` in `src/components/dashboard/review-queue.tsx:80-87` attempts to `POST` edits to `/api/leads/${activeProspect.id}/approve`. This route does not exist in the Next.js app directory and returns HTTP 404. The catch fallback calls `PATCH /api/leads/${activeProspect.id}` and `POST /api/messages/batch`, neither of which accepts `subject` or `body` in its Zod schema.
- **Why current design creates it**: The approval action was initially drafted to use a dedicated lead approval endpoint, but during subsequent refactoring into the orchestrator and batch messages router, the endpoint was never implemented and the batch schema was restricted to message IDs.
- **Simplest better design**: Create the dedicated route `src/app/api/leads/[id]/approve/route.ts` that accepts `{ subject, body }`, updates the corresponding `OutreachEmail` / `OutreachMessage` record in the database, runs pre-send deliverability checks, and marks the message approved for dispatch.
- **Implementation changes**:
  1. Author `src/app/api/leads/[id]/approve/route.ts` implementing `POST`. Validate `{ subject: z.string().optional(), body: z.string().optional() }`.
  2. In the route handler, update `db.outreachEmail` and `db.outreachMessage` for the lead with the custom subject and body.
  3. Execute `orchestrator.approveMessage(messageId, orgId)` or dispatch logic.
- **Validation method**: In `/dashboard/review`, press `E`, change subject to `"Custom Subject Test"`, press `A`. Query SQLite database `SELECT subject FROM OutreachMessage WHERE leadId = ?;` and verify that the stored subject equals `"Custom Subject Test"`.

---

### FP-2: Autopilot Mode Toggle Only Mutates Local Component State
- **Observed problem**: Toggling the "Autopilot Mode" switch in `/dashboard/review` or `/dashboard` triggers a success toast, but refreshing the page or switching tabs reverts the toggle. Autonomy remains disabled in the database.
- **Underlying cause**: `handleToggleAutopilot` in `review-queue.tsx:237-244` and `src/app/dashboard/page.tsx:33` uses local `useState(true)`. Neither component calls `/api/autonomy/toggle` or syncs with the backend `UserPreference` record.
- **Why current design creates it**: The UI toggle was developed as a visual presentation prototype without connecting the `onClick` handler to the backend autonomy toggle API.
- **Simplest better design**: Connect the toggle switch directly to `POST /api/autonomy/toggle` with optimistic UI updates, or bind it to the central Zustand store (`toggleAutonomy`).
- **Implementation changes**:
  1. In `src/components/dashboard/review-queue.tsx`, update `handleToggleAutopilot` to send `POST /api/autonomy/toggle` with `{ enabled: !isAutopilot }`.
  2. Sync state with `useDashboardStore` and SWR mutation.
- **Validation method**: Click the Autopilot toggle in `/dashboard/review`. Hard refresh the browser (`Ctrl+F5` / `Cmd+Shift+R`). Verify the toggle switch preserves its new state and `db.userPreference.findUnique({ where: { userId } }).autonomyEnabled` reflects the change.

---

### FP-3: Prospect Discovery Feed "Approve" Buttons Are Non-Functional Dead-Ends
- **Observed problem**: On the Prospect Discovery Feed (`/dashboard/leads`), clicking "Approve" on a prospect card or clicking "Approve All" displays an encouraging toast (*"Approved ... — Added to dispatch queue with 7-gate safety audit!"*), but no email is queued or dispatched, and refreshing the page removes the approved indicator.
- **Underlying cause**: `handleApprove` and `handleBulkApprove` in `src/components/dashboard/prospect-discovery-feed.tsx:45-55` only append lead IDs to a local React `Set` (`setApprovedIds`). No network request is executed.
- **Why current design creates it**: The discovery feed was built with mocked button handlers intended as visual placeholders before backend integration.
- **Simplest better design**: Wire `handleApprove` to call `POST /api/messages/batch` with `{ action: 'approve', messageIds: [lead.draftEmailId] }` or `POST /api/orchestrate` with `{ action: 'approve_prospect', leadId }`.
- **Implementation changes**:
  1. In `prospect-discovery-feed.tsx`, update `handleApprove` to issue an asynchronous `POST` to `/api/messages/batch` or `/api/orchestrate`.
  2. On response success, update the lead status in SWR cache and disable the button.
- **Validation method**: Click "Approve" on a prospect in the feed. Inspect browser network tab to confirm `HTTP 200` on `/api/messages/batch`. Query `OutreachMessage` in DB to confirm status transitioned from `draft` to `approved` or `sending`.

---

### FP-4: Onboarding Wizard Step 3 Domain Disconnect & Silent Outreach Blocking
- **Observed problem**: A new user registers, types `outreach.mycompany.com` in Step 3 of the Onboarding Wizard, and completes setup. The dashboard reports campaign initialized, but zero outbound emails are dispatched. The user is never shown DNS records to configure, nor told why outreach is frozen.
- **Underlying cause**: `src/app/onboarding/wizard/page.tsx:305-316` calls `POST /api/domains` which creates a `SendingDomain` in `pending` status. The wizard then advances to Step 4 without presenting the required DNS TXT/CNAME records or explaining that the 7-gate deliverability circuit breaker strictly prohibits sends from unverified domains.
- **Why current design creates it**: The wizard was streamlined to keep first-run setup under 60 seconds, inadvertently deferring DNS instructions without providing a clear transition banner on the subsequent dashboard.
- **Simplest better design**: In Step 3, provide a 1-click option to "Use Instant Sandbox Domain" for immediate testing, OR if entering a custom domain, display the generated DNS records with 1-click copy helpers and an explicit banner on `/dashboard`: *"Outreach paused: Verify your sending domain DNS records to activate automated dispatches."* with a direct link to `/dashboard/domains`.
- **Implementation changes**:
  1. In `src/app/onboarding/wizard/page.tsx`, add sandbox domain quick-select button.
  2. In `src/components/dashboard/header.tsx` and `/dashboard/page.tsx`, render an actionable alert banner when the primary sending domain status is `pending`.
- **Validation method**: Complete onboarding with a new custom domain. Confirm `/dashboard` displays an amber deliverability warning banner linking to `/dashboard/domains` with exact missing DNS records.

---

### FP-5: Multi-Tenant Workspace Switcher Fails Silently with HTTP 405
- **Observed problem**: In `header.tsx`, a technical operator managing multiple client workspaces selects a secondary workspace from the dropdown. The UI displays a success toast (*"Switched active workspace..."*), but queries on the page remain scoped to the original workspace.
- **Underlying cause**: `handleSelectWorkspace` in `src/components/dashboard/header.tsx:75-80` calls `PATCH /api/preferences` with `{ activeOrgId: workspace.id }`. `src/app/api/preferences/route.ts` only exports `GET` and `POST` handlers, causing Next.js to return HTTP 405 Method Not Allowed. Additionally, `PreferenceSchema` does not include `activeOrgId`. The error is caught and ignored via `.catch(() => null)`.
- **Why current design creates it**: The frontend called a `PATCH` convention while the backend preference API was authored with `GET` and `POST` upsert only, without updating the session cookie.
- **Simplest better design**: Add a `PATCH` handler to `src/app/api/preferences/route.ts` that accepts `activeOrgId`, validates that the user is an active member of that organization, updates `UserPreference.activeOrgId`, updates the NextAuth session, and triggers `window.location.reload()` to re-scope all SWR queries.
- **Implementation changes**:
  1. Add `activeOrgId: z.string().optional()` to `PreferenceSchema` in `src/app/api/preferences/route.ts`.
  2. Implement `export async function PATCH(request: NextRequest)` in `src/app/api/preferences/route.ts`.
  3. In `header.tsx:81`, call `window.location.reload()` upon successful workspace selection.
- **Validation method**: In the header dropdown, switch from Workspace A to Workspace B. Verify HTTP 200 response, page reload, and that `/api/leads` returns only leads belonging to Workspace B.

---

### FP-6: Role-Gated DNS Verification Returns 403 Without User-Facing Guidance
- **Observed problem**: An operator invited to a client workspace with role `MEMBER` clicks "Verify DNS" on `/dashboard/domains`. The request fails, and the UI displays: *"DNS records pending propagation. Please check registrar settings."*
- **Underlying cause**: `src/app/api/sending-domains/[id]/verify/route.ts:10` requires `await requireRole('ADMIN', request)`. Non-admin members receive HTTP 403 Forbidden with `{ error: { message: "Forbidden: requires ADMIN role" } }`. The frontend error handler in `domain-verifier.tsx:140` falls back to its default message attributing the failure to DNS propagation.
- **Why current design creates it**: Administrative authorization guards were applied to domain verification, but the frontend error handler assumed all verification failures were due to DNS propagation delays.
- **Simplest better design**: Update the frontend to display the exact server error message (e.g. *"Insufficient permissions: Only workspace Admins can verify sending domains"*), and either disable the verify button for `MEMBER` roles or allow members with `OPERATOR` permissions to trigger verification.
- **Implementation changes**:
  1. In `src/components/dashboard/domain-verifier.tsx:140`, check if `res.status === 403` and show a distinct permission toast.
  2. Ensure server response envelopes are properly unwrapped.
- **Validation method**: Send `GET /api/sending-domains/[id]/verify` as a user with `MEMBER` role. Verify the UI toast states *"Admin role required"* rather than *"DNS records pending propagation"*.

---

### FP-7: Production Environment Startup Fatal Crash on Ghost Clerk Keys
- **Observed problem**: When deploying the application to staging or production with `NODE_ENV=production`, background workers and runtime processes immediately throw a fatal exception: `Error: Missing production environment variables: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY`.
- **Underlying cause**: `src/lib/env.ts:32-33` checks `result.data.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `result.data.CLERK_SECRET_KEY` in its production validation block. However, the authentication system was migrated entirely to NextAuth v5 (`src/auth.ts`, `src/lib/auth/context.ts`).
- **Why current design creates it**: Legacy validation logic from an earlier prototype that used Clerk was left in `src/lib/env.ts` during the NextAuth migration.
- **Simplest better design**: Remove all Clerk keys from `src/lib/env.ts` and `src/app/layout.tsx`. Replace them with NextAuth production requirements (`NEXTAUTH_SECRET`, `DATABASE_URL`, `RESEND_WEBHOOK_SECRET`, `REDIS_URL`).
- **Implementation changes**:
  1. In `src/lib/env.ts`, delete Clerk schema entries and production checks.
  2. Add `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `REDIS_URL`, `UPSTASH_REDIS_REST_URL` to schema.
  3. In `src/app/layout.tsx`, remove `<ClerkProvider>`.
- **Validation method**: Run `NODE_ENV=production npx tsx -e "import { validateEnv } from './src/lib/env'; validateEnv();"`. Verify it passes cleanly with standard NextAuth environment variables.

---

### FP-8: Missing `REDIS_URL` in `.env.example` and Missing Upstash Keys in `env.ts`
- **Observed problem**: Operators setting up the application using `.env.example` experience BullMQ queue connection failures because `REDIS_URL` is omitted from the template. Conversely, `env.ts` fails to validate the Upstash Redis keys used for rate limiting.
- **Underlying cause**: Dual Redis architectures: BullMQ uses standard TCP Redis via `ioredis` (`REDIS_URL`), while the rate limiter and daily send counters use Upstash REST (`UPSTASH_REDIS_REST_URL`). The configuration template only documented Upstash, while `env.ts` only checked `REDIS_URL`.
- **Why current design creates it**: Asynchronous queues and rate limiters were implemented in separate phases by different modules without consolidating environment specifications.
- **Simplest better design**: Provide full documentation in `.env.example` for both `REDIS_URL` and `UPSTASH_REDIS_REST_*`, noting that in local development with SQLite, in-memory fallbacks are automatically utilized.
- **Implementation changes**:
  1. Add `REDIS_URL=redis://localhost:6379` to `.env.example`.
  2. Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to `src/lib/env.ts`.
- **Validation method**: Inspect `.env.example` and verify that both Redis configurations are present with comprehensive inline explanations.

---

### FP-9: Naive CSV Splitting Breaks on RFC 4180 Quoted Commas
- **Observed problem**: Importing a standard CRM CSV where company names or job titles contain commas (e.g. `"Sarah Jenkins",sarah@plaid.com,"Plaid, Inc.","VP, Sales"`) causes rows to be rejected with errors like `Invalid email: Invalid characters in email domain` or creates leads with corrupted column data.
- **Underlying cause**: `src/lib/safety.ts:253` splits lines using `rawLine.split(',')`. Commas inside quotation marks are treated as column delimiters, shifting subsequent column indices.
- **Why current design creates it**: A quick `.split(',')` was implemented during initial safety scaffolding without accounting for RFC 4180 quote-escaping rules.
- **Simplest better design**: Replace `rawLine.split(',')` with a quote-aware regex or standard state-machine CSV parser:
  `const matches = [...rawLine.matchAll(/(?:^|,)(?:"([^"]*(?:""[^"]*)*)"|([^,]*))/g)];`
- **Implementation changes**:
  1. In `src/lib/safety.ts`, implement a robust `parseCsvLine(line: string): string[]` helper that properly extracts fields while respecting double-quoted delimiters and escaped quotes (`""`).
  2. Use `parseCsvLine` in `parseCsv`.
- **Validation method**: Run test with CSV string: `"Acme, Inc.",test@acme.com,"VP, Sales"`. Verify parsed company is `"Acme, Inc."`, email is `"test@acme.com"`, and title is `"VP, Sales"`.

---

### FP-10: CSV Import Dialog Lacks Double-Submit Protection on Rapid Clicks
- **Observed problem**: In `csv-import-dialog.tsx`, a user who double-clicks or rapidly taps the "Import" button triggers multiple concurrent HTTP requests to `/api/orchestrate`, causing redundant background processing and duplicated event logs.
- **Underlying cause**: `handleImport` does not maintain a `loading` or `isSubmitting` state. The submit button is not disabled while the asynchronous import operation is awaiting network completion.
- **Why current design creates it**: Standard prototype dialog omitted re-entrancy protection.
- **Simplest better design**: Add `const [isSubmitting, setIsSubmitting] = useState(false)` to `CsvImportDialog`. Disable the button and display a loading spinner while submitting.
- **Implementation changes**:
  1. In `src/components/dashboard/csv-import-dialog.tsx`, wrap `handleImport` in `setIsSubmitting(true)` / `finally { setIsSubmitting(false); }`.
  2. Bind `disabled={isSubmitting || !csvText.trim()}` on the submit `Button`.
- **Validation method**: Simulate rapid consecutive clicks on the Import button. Confirm only one network request is dispatched and the button renders a disabled spinner state.

---

### FP-11: Review Queue Keyboard Shortcut `A` Lacks Pre-Flight Re-Entrancy Lock
- **Observed problem**: In the 5-Second Review Queue (`/dashboard/review`), a power user rapidly tapping `A` can fire multiple concurrent approval executions for the same prospect before the component transitions to the next item.
- **Underlying cause**: In `src/components/dashboard/review-queue.tsx:74-77`, `handleApprove()` sets `setIsPersisting(true)`, but does not check `if (isPersisting) return;` at the very beginning of the function.
- **Why current design creates it**: The keyboard listener bound directly to `handleApprove` without an early-exit guard on in-flight persistence.
- **Simplest better design**: Add `if (isPersisting) return;` at the top of `handleApprove`, `handleReject`, and keyboard handler callbacks.
- **Implementation changes**:
  1. In `src/components/dashboard/review-queue.tsx:75`, insert `if (isPersisting) return;`.
  2. Repeat for `handleReject` and `handleRegenerate`.
- **Validation method**: Press `A` 5 times within 100ms in the review queue. Confirm that only 1 approval network request is initiated for the active prospect.

---

### FP-12: Inoperable Emergency Killswitch Due to Zod Schema Property Key Mismatch
- **Observed problem**: During an adverse operational incident, an operator navigates to `/dashboard/autonomy` and clicks "Pause Outreach Agent". The UI displays an error toast: *"Failed to toggle autonomy state."* Background SDR dispatches continue unabated.
- **Underlying cause**: `autonomy-panel.tsx:104` sends JSON body `{ pause: willPause }`. The backend endpoint `src/app/api/autonomy/pause/route.ts:7-18` validates incoming payloads using:
  ```typescript
  const PauseSchema = z.object({
    paused: z.boolean(),
    reason: z.string().optional(),
    leadId: z.string().optional(),
  });
  ```
  Zod fails with `Required: Expected boolean, received undefined at "paused"`, returning HTTP 400.
- **Why current design creates it**: The frontend component used the property name `pause` while the backend schema author defined it as `paused`.
- **Simplest better design**: Make the backend schema resilient by accepting either `paused` or `pause`, and normalize it in the route:
  ```typescript
  const PauseSchema = z.object({
    paused: z.boolean().optional(),
    pause: z.boolean().optional(),
    reason: z.string().optional(),
    leadId: z.string().optional(),
  }).refine(data => data.paused !== undefined || data.pause !== undefined, {
    message: "Must provide either 'paused' or 'pause'",
  });
  ```
- **Implementation changes**:
  1. Update `PauseSchema` in `src/app/api/autonomy/pause/route.ts` to accept both `paused` and `pause`.
  2. Update `autonomy-panel.tsx:104` to send `paused: willPause`.
- **Validation method**: Click "Pause Outreach Agent" in `/dashboard/autonomy`. Confirm HTTP 200 response, success toast *"⚠️ Outreach Agent Paused"*, amber banner activation, and `db.userPreference.autonomyPaused === true`.

---

### FP-13: Silent Local Send False Positives When `RESEND_API_KEY` Is Unset
- **Observed problem**: When running in development or staging without a configured Resend API key, the system marks outreach emails as `sent` in the database and displays green success toasts in the UI, concealing from the operator that no real outbound emails were sent.
- **Underlying cause**: `src/lib/deliverability/index.ts:98-124` checks `if (!isResendConfigured())`. It logs a warning to the server console, updates `db.outreachMessage` status to `sent`, and returns `{ success: true, providerId: 'local_only' }`. The frontend does not distinguish `local_only` from a genuine SMTP/Resend dispatch.
- **Why current design creates it**: Implemented to allow end-to-end frontend flows to complete without requiring third-party credentials during testing.
- **Simplest better design**: When `providerId === 'local_only'`, surface a distinct persistent UI badge and top-level banner on `/dashboard` and `/dashboard/review`: *"Demo Mode: RESEND_API_KEY is not configured. Emails are saved locally but not sent to real recipients."*
- **Implementation changes**:
  1. In `src/components/dashboard/header.tsx` or `/dashboard/page.tsx`, add an environment status banner checking `/api/health` or `/api/preferences`.
  2. In `review-queue.tsx`, if response indicates `local_only`, show informative toast: *"Saved locally (Simulation Mode — Resend unconfigured)"*.
- **Validation method**: Unset `RESEND_API_KEY`. Approve an email in the review queue. Verify the UI explicitly notifies the user that the send was simulated locally.

---

### FP-14: Resend Free Sandbox Destination Restriction Causes Unexplained Failed Dispatches
- **Observed problem**: In default testing with `DEFAULT_SENDER_EMAIL=onboarding@resend.dev`, all dispatches to prospective leads fail at the API level with HTTP 403 Forbidden (*"You can only send to your own email address while in sandbox mode"*). The messages enter a retry loop and eventually fail without user-facing explanation.
- **Underlying cause**: Resend's free sandbox domain strictly prohibits delivery to external third-party domains.
- **Why current design creates it**: The application defaulted to Resend's testing sender without warning non-technical users about sandbox destination constraints.
- **Simplest better design**: In `/dashboard`, when the active sending domain is `resend.dev` or `DEFAULT_SENDER_EMAIL` is `onboarding@resend.dev`, display an informative banner explaining that external outreach is restricted to the account owner's email until a custom sending domain is connected.
- **Implementation changes**:
  1. Add a sandbox mode detection utility in `src/lib/deliverability`.
  2. Display a dismissible banner on `/dashboard` informing the user of sandbox mode restrictions and providing a 1-click CTA to `/dashboard/domains`.
- **Validation method**: Configure `DEFAULT_SENDER_EMAIL=onboarding@resend.dev`. Verify `/dashboard` renders the Sandbox Alert banner with domain setup CTA.

---

### FP-15: Empty State "Load Sample High-Intent Data" Does Not Populate Review Queue
- **Observed problem**: A new user clicks "Load Sample High-Intent Data" on an empty state in `/dashboard`, then navigates to `/dashboard/review` expecting to experience the 5-second review workflow. The review queue is empty.
- **Underlying cause**: `POST /api/seed-sample` (`src/app/api/seed-sample/route.ts:58-128`) seeds 5 `Lead` rows and 5 `Signal` rows, but does not create any `OutreachEmail` or `OutreachMessage` draft records.
- **Why current design creates it**: The seed endpoint was written before the review queue draft email schema was standardized.
- **Simplest better design**: Update `POST /api/seed-sample` to also generate realistic draft `OutreachMessage` and `OutreachEmail` records for the seeded leads, complete with personalized subject lines, trigger signal references, and confidence scores.
- **Implementation changes**:
  1. In `src/app/api/seed-sample/route.ts`, create corresponding `OutreachEmail` and `OutreachMessage` records in status `QUEUED` / `draft` for the 5 seeded leads.
- **Validation method**: Clear database, navigate to empty `/dashboard`, click "Load Sample High-Intent Data", navigate to `/dashboard/review`. Verify all 5 review prospects immediately appear in the queue.

---

### FP-16: Background Job Queue Silently Stalls When Redis Is Unconfigured
- **Observed problem**: In standalone environments without Redis, background enrichment jobs and autonomous cycles sit in `db.jobQueue` with status `queued_without_redis` and never execute.
- **Underlying cause**: `src/lib/queue/producers.ts:60-68` falls back to inserting jobs into SQLite when Redis is unavailable, but no in-process worker polls or drains `db.jobQueue`.
- **Why current design creates it**: Dual-mode queueing was designed with the expectation that a standalone polling worker would run in the background.
- **Simplest better design**: When Redis is not configured, execute jobs inline (synchronously) or provide a lightweight `setInterval` in-process task runner that drains `db.jobQueue`.
- **Implementation changes**:
  1. In `src/lib/queue/producers.ts`, if `!isRedisConfigured()`, execute task handlers directly or trigger an immediate in-process dispatch.
  2. Surface queue connectivity status on `/dashboard`.
- **Validation method**: Run app without Redis. Enqueue an enrichment job. Verify the job completes and transitions out of queued state within 5 seconds.

---

## Cross-Persona Friction Summary Matrix

| ID | Persona | Severity | Frequency | Friction Vector | Primary Impact |
|---|---|---|---|---|---|
| **FP-1** | Sales Manager | CRITICAL | HIGH | Review queue inline edit loss | User-customized email copy permanently dropped on approval; raw AI draft dispatched. |
| **FP-2** | Sales Manager | HIGH | HIGH | Autopilot toggle state desync | Autopilot switch only mutates React state; reverts on refresh. |
| **FP-3** | Sales Manager | HIGH | MEDIUM | Discovery feed approval dead-end | Approve buttons show toast but trigger no API call or queue insertion. |
| **FP-4** | Sales Manager | HIGH | HIGH | Wizard Step 3 domain disconnect | Pending domain created without DNS guidance; sends blocked without explanation. |
| **FP-5** | Tech Operator | CRITICAL | HIGH | Workspace switcher HTTP 405 | Selecting workspace fails silently; data mutations execute in wrong tenant. |
| **FP-6** | Tech Operator | MEDIUM | MEDIUM | Role-gated DNS verify 403 | Non-admin members receive cryptic DNS propagation error rather than permission info. |
| **FP-7** | Tech Operator | CRITICAL | LOW | Production crash on Clerk keys | App crashes on boot in production due to obsolete Clerk validation in `env.ts`. |
| **FP-8** | Tech Operator | HIGH | LOW | Missing `REDIS_URL` in `.env.example` | BullMQ worker fails to connect; template lacks required queue variable. |
| **FP-9** | Edge-Case User | HIGH | HIGH | Naive CSV split breaks on quotes | Standard CRM exports with quoted commas corrupted; leads rejected. |
| **FP-10** | Edge-Case User | MEDIUM | MEDIUM | CSV dialog double-submit lack | Rapid clicks dispatch duplicate import jobs. |
| **FP-11** | Edge-Case User | MEDIUM | HIGH | Review queue hotkey re-entrancy | Rapid `A` keystrokes fire concurrent approval requests. |
| **FP-12** | Adverse User | CRITICAL | LOW | Inoperable emergency killswitch | Schema key mismatch (`pause` vs `paused`) returns 400; pause fails during emergencies. |
| **FP-13** | Adverse User | HIGH | HIGH | Silent local send false positives | Emails marked sent locally without UI warning when Resend key is missing. |
| **FP-14** | Adverse User | HIGH | HIGH | Resend sandbox send restrictions | Outbound sends fail at API level without proactive UI explanation of sandbox limits. |
| **FP-15** | Sales Manager | MEDIUM | HIGH | Sample seed omits review drafts | 1-click sample data leaves review queue empty. |
| **FP-16** | Tech Operator | HIGH | MEDIUM | Unprocessed DB queue without Redis | Background jobs stall indefinitely in `db.jobQueue` when Redis is absent. |

---

## Conclusion & Handoff to Remediation

This friction audit establishes an incontrovertible factual baseline of the ProactiveReach user experience. The identified friction points are not cosmetic preferences; they are concrete functional bugs, schema mismatches, and architectural disconnects that undermine client trust and platform viability.

Remediating these 16 points — beginning with the CRITICAL blockers (Emergency Killswitch FP-12, Review Queue Edit Loss FP-1, Workspace Switcher FP-5, and Production Environment Crash FP-7) — will transform ProactiveReach into an airtight, commercially viable Autonomous AI SDR platform ready for immediate client delivery.
