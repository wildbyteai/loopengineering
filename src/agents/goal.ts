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
      const resp = await ctx.llm.chat(messages, { system })
      const goal = StandardGoalSchema.parse(JSON.parse(resp.text))

      await ctx.store.set('goals', 'current', goal)

      return this.ok(
        { goal },
        resp.usage.input_tokens + resp.usage.output_tokens,
        this.timing(start),
      )
    } catch (err) {
      return this.fail(`GoalAgent failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
