import type { AgentContext, AgentResult } from '../core/types.js'

export abstract class BaseAgent {
  abstract readonly name: string

  abstract run(
    input: Record<string, unknown>,
    ctx: AgentContext,
  ): Promise<AgentResult>

  protected ok(data: Record<string, unknown>, tokens?: number, duration?: number): AgentResult {
    return {
      agent_name: this.name,
      success: true,
      data,
      tokens_used: tokens,
      duration_ms: duration,
    }
  }

  protected fail(error: string): AgentResult {
    return {
      agent_name: this.name,
      success: false,
      data: {},
      error,
    }
  }

  protected timing(start: number): number {
    return Date.now() - start
  }
}
