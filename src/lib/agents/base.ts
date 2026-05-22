// ─── Base Agent ────────────────────────────────────────
// Abstract base class that all agents extend

import { AgentContext, AgentResult, Phase } from './types';

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
