import { BaseAgent } from './base.js'
import type { AgentContext, AgentResult } from '../core/types.js'
import { StandardGoalSchema } from '../core/types.js'
import { goalPrompt } from '../prompts/goal.js'

export class GoalAgent extends BaseAgent {
  readonly name = 'GoalAgent'

  async run(
    input: { raw_goal: string },
    ctx: AgentContext,
  ): Promise<AgentResult> {
    const start = Date.now()

    try {
      const { messages, system } = goalPrompt(input.raw_goal)
      const goal = await ctx.llm.chatJSON(messages, StandardGoalSchema, { system })

      // 写入 store
      await ctx.store.set('goals', 'current', goal)

      return this.ok({ goal }, undefined, this.timing(start))
    } catch (err) {
      return this.fail(`GoalAgent failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
