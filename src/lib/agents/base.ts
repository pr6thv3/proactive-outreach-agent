// ─── Base Agent ────────────────────────────────────────
// Abstract base class that all agents extend

import { AgentContext, AgentResult, Phase } from './types';
import { recordAgentEvent } from './infrastructure/observability';

export abstract class BaseAgent<TInput, TOutput> {
  abstract readonly name: string;
  abstract readonly phase: Phase;
  abstract readonly description: string;

  /**
   * Execute the agent's core logic
   */
  abstract execute(input: TInput, context: AgentContext): Promise<TOutput>;

  /**
   * Validate inputs before execution
   */
  protected validate(input: TInput, _context: AgentContext): void {
    if (!input) {
      throw new Error(`[${this.name}] Input is required`);
    }
  }

  /**
   * Run the agent with error handling, timing, and logging
   */
  async run(input: TInput, context: AgentContext): Promise<AgentResult<TOutput>> {
    const startTime = Date.now();

    try {
      this.validate(input, context);
      const data = await this.execute(input, context);
      const durationMs = Date.now() - startTime;

      await recordAgentEvent({
        organizationId: context.organizationId,
        leadId: context.leadId,
        campaignId: context.campaignId,
        agentName: this.name,
        stepName: this.name,
        phase: this.phase,
        level: 'info',
        message: `${this.name} completed successfully`,
        inputData: input,
        outputData: data,
        status: 'completed',
        traceId: context.traceId,
        durationMs,
      }).catch(() => {});

      return {
        success: true,
        data,
        durationMs,
        agentName: this.name,
        phase: this.phase,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);

      await recordAgentEvent({
        organizationId: context.organizationId,
        leadId: context.leadId,
        campaignId: context.campaignId,
        agentName: this.name,
        stepName: this.name,
        phase: this.phase,
        level: 'error',
        message: `${this.name} failed: ${message}`,
        inputData: input,
        status: 'failed',
        error: message,
        traceId: context.traceId,
        durationMs,
      }).catch(() => {});

      return {
        success: false,
        data: null as TOutput,
        error: message,
        durationMs,
        agentName: this.name,
        phase: this.phase,
      };
    }
  }
}
