/**
 * Policy & Progressive Autonomy Engine — Type Definitions
 * Enterprise-grade contracts for the 10-step deterministic execution pipeline,
 * 4-level progressive autonomy model, 8 deterministic safety gates, and review deck.
 */

// ─── 1. PROGRESSIVE AUTONOMY LEVELS ──────────────────────────────────────────

export enum AutonomyLevel {
  LEVEL_0_DRAFT = 0,       // Draft Only: AI suggests copy/strategy into draft state. Zero automated sends or approvals.
  LEVEL_1_ASSISTED = 1,    // Assisted: AI discovers, enriches, drafts. 100% of outbound communications require human approval.
  LEVEL_2_SUPERVISED = 2,  // Supervised: AI auto-approves High Confidence items (Score >= 85, Spam <= 0.10, Verified Domain).
  LEVEL_3_AUTONOMOUS = 3,  // Autonomous: Full Autopilot with hard daily quota caps, automated circuit breakers, and killswitches.
}

export type AutonomyLevelString = 'LEVEL_0_DRAFT' | 'LEVEL_1_ASSISTED' | 'LEVEL_2_SUPERVISED' | 'LEVEL_3_AUTONOMOUS';

export interface AutonomyConfig {
  level: AutonomyLevel;
  autoApproveThreshold: number; // Lead score threshold for auto-approval (e.g. 85 in L2, minLeadScore in L3)
  maxSpamRiskThreshold: number; // Maximum spam risk tolerated for auto-execution (e.g. 0.10 in L2, 0.25 in L3)
  maxDailySends: number;
  circuitBreakerBounceThreshold: number; // e.g. 0.03 (3%)
  circuitBreakerComplaintThreshold: number; // e.g. 0.001 (0.1%)
}

// ─── 2. 10-STEP PIPELINE STEPS ───────────────────────────────────────────────

export enum PolicyPipelineStep {
  TASK_UNDERSTANDING = 'TASK_UNDERSTANDING',                       // Step 1: Parse intent, lead context, signals, and goal
  CONTEXT_RULES_ASSEMBLY = 'CONTEXT_RULES_ASSEMBLY',               // Step 2: Load workspace policies, domain status, DNC, autonomy
  EXECUTION_PLAN_CONSTRUCTION = 'EXECUTION_PLAN_CONSTRUCTION',     // Step 3: Formulate strategy, angle, recipient, proposed mutations
  DETERMINISTIC_POLICY_VALIDATION = 'DETERMINISTIC_POLICY_VALIDATION', // Step 4: Evaluate against 8 deterministic policies (ZERO LLM veto)
  TOOL_SUBAGENT_EXECUTION = 'TOOL_SUBAGENT_EXECUTION',             // Step 5: Execute generation, enrichment, or staging action
  RESULT_VALIDATION = 'RESULT_VALIDATION',                         // Step 6: Validate output schema, token counts, syntax, required variables
  RISK_EVALUATION = 'RISK_EVALUATION',                             // Step 7: Compute multi-vector composite risk score (0-100)
  APPROVAL_GATE_CHECK = 'APPROVAL_GATE_CHECK',                     // Step 8: Gate check based on Autonomy Level, Risk, and Confidence
  COMMIT_ACTION = 'COMMIT_ACTION',                                 // Step 9: Atomic CAS Claim + Durable Idempotent Dispatch
  AUDIT_EVENT_EMISSION = 'AUDIT_EVENT_EMISSION',                   // Step 10: Record immutable Audit Event and Agent Event
}

// ─── 3. DETERMINISTIC POLICY GATES (ZERO LLM VETO) ───────────────────────────

export enum DeterministicPolicyGate {
  AUTONOMY_LEVEL_PERMISSION = 'AUTONOMY_LEVEL_PERMISSION',         // Gate 1: Code-enforced autonomy permissions
  SUPPRESSION_DNC_COMPLIANCE = 'SUPPRESSION_DNC_COMPLIANCE',       // Gate 2: Suppression & DNC list verification
  DOMAIN_VERIFICATION_REPUTATION = 'DOMAIN_VERIFICATION_REPUTATION', // Gate 3: SPF/DKIM/DMARC active & domain reputation healthy
  WORKSPACE_CAMPAIGN_QUOTA = 'WORKSPACE_CAMPAIGN_QUOTA',           // Gate 4: Daily and hourly send limits
  SEND_WINDOW_TIMEZONE = 'SEND_WINDOW_TIMEZONE',                   // Gate 5: Business hours & weekday schedule compliance
  CONTENT_SPAM_SAFETY = 'CONTENT_SPAM_SAFETY',                     // Gate 6: Keyword safety & spam risk threshold
  LEAD_ELIGIBILITY_MIN_SCORE = 'LEAD_ELIGIBILITY_MIN_SCORE',       // Gate 7: Min ICP score & valid non-disposable email
  RECIPIENT_DEDUP_FREQUENCY_CAPPING = 'RECIPIENT_DEDUP_FREQUENCY_CAPPING', // Gate 8: Frequency capping & duplicate prevention
}

export type PolicyViolationSeverity = 'fatal' | 'warning';

export interface PolicyViolation {
  policyId: string;
  gate: DeterministicPolicyGate;
  severity: PolicyViolationSeverity;
  reason: string;
  remediationAction?: string;
  details?: Record<string, any>;
}

export interface PolicyValidationResult {
  allowed: boolean;
  blockedPolicy?: DeterministicPolicyGate;
  violations: PolicyViolation[];
  passedGates: DeterministicPolicyGate[];
}

// ─── 4. PIPELINE EXECUTION CONTEXT & PLAN ─────────────────────────────────────

export type TaskType = 
  | 'email_draft'
  | 'email_dispatch'
  | 'lead_enrichment'
  | 'lead_scoring'
  | 'campaign_mutation'
  | 'dnc_update';

export interface PolicyExecutionContext<TInput = any> {
  organizationId: string;
  userId?: string;
  traceId: string;
  autonomyLevel: AutonomyLevel;
  taskType: TaskType;
  input: TInput;
  leadId?: string;
  campaignId?: string;
  messageId?: string;
  domainId?: string;
  timestamp?: Date;
  metadata?: Record<string, any>;
}

export interface ExecutionStep {
  stepIndex: number;
  name: string;
  action: string;
  params: Record<string, any>;
}

export interface ProposedMutation {
  targetModel: 'Lead' | 'OutreachEmail' | 'Campaign' | 'DoNotContact' | 'WorkflowExecution';
  targetId?: string;
  mutationType: 'create' | 'update' | 'delete';
  proposedState: Record<string, any>;
}

export interface ExecutionPlan {
  planId: string;
  taskType: TaskType;
  strategy: string;
  angle?: string;
  recipientEmail?: string;
  recipientName?: string;
  proposedSubject?: string;
  proposedBody?: string;
  proposedMutations: ProposedMutation[];
  requiredPolicies: DeterministicPolicyGate[];
  steps: ExecutionStep[];
}

// ─── 5. EXECUTION & VALIDATION RESULTS ────────────────────────────────────────

export interface ToolExecutionResult<TOutput = any> {
  success: boolean;
  data?: TOutput;
  tokenCount?: number;
  error?: string;
  outputSchemaValid: boolean;
  rawResponse?: any;
}

export interface RiskVectorScores {
  domainReputation: number;    // 0-100 (100 = perfect)
  spamKeywordRisk: number;     // 0.0 - 1.0 (0 = clean)
  pacingAndBudget: number;     // 0-100
  circuitBreakerStatus: 'pass' | 'warn' | 'block';
  sentimentAnomaly?: number;
}

export interface RiskEvaluationResult {
  riskScore: number;           // Composite risk score (0-100, where 0 is lowest risk)
  status: 'pass' | 'warn' | 'block';
  riskVectors: RiskVectorScores;
  remediationSteps: string[];
}

export type ApprovalDecision = 'AUTO_APPROVED' | 'WAITING_APPROVAL' | 'REJECTED';

export interface ApprovalGateResult {
  decision: ApprovalDecision;
  requiresHumanApproval: boolean;
  reason: string;
  confidenceTier: 'high' | 'medium' | 'attention';
}

export interface CommitActionResult {
  committed: boolean;
  idempotencyKey?: string;
  casClaimAcquired: boolean;
  sideEffectResult?: any;
  error?: string;
}

export interface AuditEventRecord {
  id: string;
  traceId: string;
  organizationId: string;
  eventType: string;
  autonomyLevel: AutonomyLevel;
  action: string;
  actor: string;
  timestamp: string;
  details: Record<string, any>;
}

export interface PolicyPipelineResult<TOutput = any> {
  success: boolean;
  state: 'COMPLETED' | 'WAITING_APPROVAL' | 'POLICY_BLOCKED' | 'FAILED';
  currentStep: PolicyPipelineStep;
  stepResults: Partial<Record<PolicyPipelineStep, any>>;
  plan?: ExecutionPlan;
  data?: TOutput;
  riskScore: number;
  requiresHumanApproval: boolean;
  violations: PolicyViolation[];
  auditEvent?: AuditEventRecord;
  error?: string;
  durationMs: number;
}

// ─── 6. CUSTOM ERRORS ─────────────────────────────────────────────────────────

export class PolicyViolationError extends Error {
  public readonly code: string;
  public readonly gate?: DeterministicPolicyGate;
  public readonly violations: PolicyViolation[];

  constructor(code: string, message: string, gate?: DeterministicPolicyGate, violations: PolicyViolation[] = []) {
    super(message);
    this.name = 'PolicyViolationError';
    this.code = code;
    this.gate = gate;
    this.violations = violations;
    Object.setPrototypeOf(this, PolicyViolationError.prototype);
  }
}
