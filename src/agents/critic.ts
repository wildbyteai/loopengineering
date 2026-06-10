import { BaseAgent } from './base.js'
import type { AgentContext, AgentResult, Task, TaskResult, Feedback } from '../core/types.js'
import { criticPrompt, ALL_LENSES, type CriticLens } from '../prompts/critic.js'
import { z } from 'zod'

const CriticVerdictSchema = z.object({
  passed: z.boolean(),
  reasoning: z.string(),
  issues: z.array(z.string()),
  improvements: z.array(z.string()),
})

export class CriticAgent extends BaseAgent {
  readonly name = 'CriticAgent'

  async run(
    input: { task_result: TaskResult; iteration: number },
    ctx: AgentContext,
  ): Promise<AgentResult> {
    const start = Date.now()
    const { task_result, iteration } = input

    try {
      const task = await ctx.store.get<Task>(`tasks_${iteration}`, task_result.task_id)
      if (!task) {
        return this.fail(`Task ${task_result.task_id} not found in iteration ${iteration}`)
      }

      // 3 个独立视角并行验证，每个用不同模型参数
      const verdicts = await Promise.all(
        ALL_LENSES.map(lens => this.evaluateLens(task, task_result, ctx, lens)),
      )

      const passedCount = verdicts.filter(v => v.passed).length
      const overallPassed = passedCount >= 2

      const allIssues = verdicts.flatMap(v => v.issues)
      const allImprovements = verdicts.flatMap(v => v.improvements)

      const severity: Feedback['severity'] = !overallPassed
        ? (passedCount === 0 ? 'critical' : 'major')
        : allIssues.length > 0 ? 'minor' : 'info'

      const feedback: Feedback = {
        task_id: task_result.task_id,
        passed: overallPassed,
        issues: allIssues,
        improvements: allImprovements,
        severity,
        perspectives: verdicts.map((v, i) => ({
          lens: ALL_LENSES[i],
          passed: v.passed,
          reasoning: v.reasoning,
        })),
        created_at: new Date().toISOString(),
      }

      await ctx.store.set(`feedback_${iteration}`, task_result.task_id, feedback)

      const totalTokens = verdicts.reduce((sum, v) => sum + (v.tokens ?? 0), 0)
      return this.ok({ feedback }, totalTokens, this.timing(start))
    } catch (err) {
      return this.fail(`CriticAgent failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private async evaluateLens(
    task: Task,
    result: TaskResult,
    ctx: AgentContext,
    lens: CriticLens,
  ): Promise<z.infer<typeof CriticVerdictSchema> & { tokens: number }> {
    const { messages, system } = criticPrompt(task, result, ctx.goal, lens)
    try {
      const resp = await ctx.llm.chat(messages, { system })
      const verdict = CriticVerdictSchema.parse(JSON.parse(resp.text))
      return { ...verdict, tokens: resp.usage.input_tokens + resp.usage.output_tokens }
    } catch {
      return {
        passed: false,
        reasoning: `Lens "${lens}" evaluation failed — defaulting to rejected`,
        issues: [`${lens} evaluation could not be completed`],
        improvements: [],
        tokens: 0,
      }
    }
  }
}
