# System Architecture Guide — Proactive Outreach Agent

This document defines the architectural blueprints, system boundaries, and processing pipelines of the Proactive Outreach Agent.

---

## 1. System Overview

The application comprises four primary layers: the Next.js Web Dashboard, Next.js API Routes, the background processing worker pool, and the data engines (Prisma relational database + Redis queue).

```mermaid
graph TD
    User([SDR / Agency User]) -->|Interacts| WebUI[Next.js Web Dashboard]
    WebUI -->|API Requests| APIRoutes[Next.js API Routes /api/*]
    APIRoutes -->|Authentication| Clerk[Clerk Auth & RBAC]
    
    subgraph Jobs [Task Queue Infrastructure]
        BullMQ[BullMQ & Redis Queue]
        JobQueueDB[(Prisma DB JobQueue Table)]
        Worker[Bun Worker Process]
    end
    
    APIRoutes -->|Enqueue Jobs| BullMQ
    APIRoutes -->|Fallback Enqueue| JobQueueDB
    
    Worker -->|Poll & Execute| BullMQ
    Worker -->|Fallback Poll| JobQueueDB
    
    subgraph Storage [Persistence Layer]
        DB[(PostgreSQL / SQLite)]
        VectorDB[(pgvector Embeddings)]
    end
    
    APIRoutes -->|Read / Write| DB
    Worker -->|Read / Write| DB
    Worker -->|Query Vectors| VectorDB
```

---

## 2. System Data Flow

The following diagram maps the lifecycle of a lead through the 4-phase autonomous cycle:

```mermaid
graph LR
    LeadImport[Lead Import] -->|Observe Phase| Enrichment[Enrichment & Scraping]
    Enrichment -->|Extract Signals| SignalInt[Signal Intelligence]
    SignalInt -->|Think Phase| LeadScoring[Lead & Signal Scoring]
    LeadScoring -->|Strategy Selector| Strategy[Outreach Strategy Selection]
    Strategy -->|Act Phase| MsgDraft[Outreach Message Draft]
    MsgDraft -->|Human Approval| Approved[Approved Message]
    Approved -->|Send Readiness Check| Sent[Sent via Resend]
    Sent -->|Re-evaluate Phase| Replies[Reply Classification]
    Replies -->|Feedback Loop| AgentMem[Agent Memory]
    AgentMem -->|Update Rules| Strategy
```

---

## 3. Request Lifecycle

The API requests lifecycle, focusing on the `/api/orchestrate` endpoint, enforces strict validation, security context checks, and async task delegation:

```mermaid
sequenceDiagram
    autonumber
    actor User as User Dashboard
    participant API as API Route (/api/orchestrate)
    participant Auth as Clerk Middleware
    participant Database as Prisma DB
    participant Queue as Queue Producer

    User->>API: POST /api/orchestrate { action, leadId, traceId }
    API->>Auth: requireWorkspace()
    Auth-->>API: Return UserContext (OrgId, Role)
    API->>API: Validate Zod Schema (action-specific)
    API->>API: checkRole(roleRequirement)
    
    alt Redis is Online
        API->>Queue: enqueueJob()
        Queue-->>API: Job Enqueued (BullMQ)
    else Redis is Offline
        API->>Database: create JobQueue Record (status=pending)
        Database-->>API: Job Record Created
    end

    API->>Database: Log PipelineRun (status=running, traceId)
    API-->>User: Return OK (202 Accepted, traceId)
```

---

## 4. Worker Pipeline Run

The background worker manages job execution asynchronously, with a safe fallback mechanism if Redis is offline:

```mermaid
graph TD
    Start[Worker Heartbeat Loop] --> CheckRedis{Is Redis online?}
    
    CheckRedis -->|Yes| FetchBull[Fetch Job from BullMQ]
    CheckRedis -->|No| FetchDB[Poll JobQueue Table where status=pending]
    
    FetchBull --> LockJob[Lock Job for Processing]
    FetchDB --> LockJob
    
    LockJob --> RiskCheck{evaluateSendReadiness}
    
    RiskCheck -->|Block| MarkFailed[Mark Job Failed & Log Reason]
    RiskCheck -->|Pass| RunAgent[Execute Agent Logic]
    
    RunAgent --> Success{Execution Successful?}
    Success -->|Yes| MarkDone[Mark Completed & Record Result]
    Success -->|No| HandleError[Increment Retry Count / Dead Letter]
    
    MarkFailed --> Release[Release Lock & Sleep]
    MarkDone --> Release
    HandleError --> Release
    Release --> Start
```

---

## 5. Webhook Ingestion Pipeline

All external delivery events are received, validated, and processed asynchronously via the Resend webhook endpoint:

```mermaid
graph TD
    Resend[Resend Mail Service] -->|POST Webhook Event| WH[API /api/webhooks/resend]
    WH --> CheckSig{Verify Resend Signature?}
    
    CheckSig -->|Invalid| Reject[401 Unauthorized]
    CheckSig -->|Valid| QueueJob[Enqueue webhook-processing Job]
    
    QueueJob --> Worker[Worker Process]
    Worker --> LogEvent[Create EmailEvent Record]
    
    LogEvent --> CheckType{Event Type?}
    
    CheckType -->|bounced| ProcessBounce[Parse Bounce: Hard/Soft -> Update SendingDomain Reputation & DNC]
    CheckType -->|complained| ProcessComplaint[Update Sender Rep & DNC]
    CheckType -->|opened/clicked| ProcessEngagement[Update Open/Click metrics in ReputationSnapshot]
```

---

## 6. Tenant Isolation Boundaries

Data and access control boundaries prevent any leakage between organization workspaces:

```mermaid
graph LR
    subgraph ClerkAuth [Identity Provider Clerk]
        User1[User A] -->|Member of| OrgA[Org Workspace A]
        User2[User B] -->|Member of| OrgB[Org Workspace B]
    end

    subgraph AppServer [Application Router]
        Middleware[requireWorkspace Middleware]
    end

    subgraph DatabaseLayers [Prisma DB Scoping]
        OrgA_Leads[(Org A Leads: query filtered by organizationId)]
        OrgB_Leads[(Org B Leads: query filtered by organizationId)]
    end

    OrgA --> Middleware
    OrgB --> Middleware
    Middleware -->|Enforce Org A ID| OrgA_Leads
    Middleware -->|Enforce Org B ID| OrgB_Leads
```

---

## 7. Deployment Topology

The production setup utilizes high-availability hosting with decoupled web and background worker services:

```mermaid
graph TD
    Client([Client Browser]) -->|HTTPS| CDN[Edge CDN / Routing]
    CDN -->|Web Traffic| AppServer[Next.js App Server on Vercel/Render]
    CDN -->|Socket / Webhooks| AppServer
    
    AppServer -->|Auth Tokens| ClerkService[Clerk Auth SaaS]
    
    subgraph CloudInfra [Internal Infrastructure]
        WorkerPool[Bun Worker Instances on Render/Railway]
        RedisPool[(Managed Redis BullMQ Host)]
        DBCluster[(Managed PostgreSQL Database)]
    end
    
    AppServer -->|Read/Write SQL| DBCluster
    AppServer -->|Enqueue Tasks| RedisPool
    WorkerPool -->|Poll Tasks| RedisPool
    WorkerPool -->|Read/Write SQL| DBCluster
    WorkerPool -->|External Calls| Resend[Resend Mail API]
```

---

## 8. Failure Mode & Fallback Engineering

| Failure Mode | Detection Indicator | Architectural Fallback / Remediation |
| :--- | :--- | :--- |
| **Redis Outage** | Connection refused, timeout on enqueue | Instantly switches to DB-backed `JobQueue` fallback. The UI dashboard displays job status by querying `JobQueue` records. Workers poll the database using standard locks. |
| **LLM Provider Timeout** | HTTP 504 / connection timeout in `llm-reasoning.ts` | The agent catches the error, increments retry count, and backs off. If retries fail, it falls back to a template-driven pitching model using default campaign offers. |
| **Resend API Over Limit** | HTTP 429 Rate Limit Exceeded | The `EmailSenderAgent` rescheduling mechanism detects the 429 status and schedules the message back into the queue with an exponential delay offset. |
| **Domain Reputation Drop** | Domain reputation score falls below 30 | The `evaluateSendReadiness` check blocks any further enqueued sends for the domain. An Activity log and Alert are generated, notifying the admin to pause the campaign or rotate domain pools. |
| **Clerk API Down** | Authentication verification failure | The application middleware falls back to checking localized Dev-Auth bypass keys if configured in the environment, preventing local lockout during third-party outages. |
