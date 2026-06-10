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
    input: { task_result: TaskResult },
    ctx: AgentContext,
  ): Promise<AgentResult> {
    const start = Date.now()
    const { task_result } = input

    try {
      // 获取对应的任务
      const task = await ctx.store.get<Task>('tasks', task_result.task_id)
      if (!task) {
        return this.fail(`Task ${task_result.task_id} not found`)
      }

      // 3 个独立视角并行验证
      const verdicts = await Promise.all(
        ALL_LENSES.map(lens => this.evaluateLens(task, task_result, ctx, lens)),
      )

      // 2/3 多数票机制
      const passedCount = verdicts.filter(v => v.passed).length
      const overallPassed = passedCount >= 2

      // 合并所有问题和建议
      const allIssues = verdicts.flatMap(v => v.issues)
      const allImprovements = verdicts.flatMap(v => v.improvements)

      // 判断严重程度
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

      // 写入 feedback queue
      await ctx.store.set('feedback', task_result.task_id, feedback)

      return this.ok({ feedback }, undefined, this.timing(start))
    } catch (err) {
      return this.fail(`CriticAgent failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private async evaluateLens(
    task: Task,
    result: TaskResult,
    ctx: AgentContext,
    lens: CriticLens,
  ): Promise<z.infer<typeof CriticVerdictSchema>> {
    const { messages, system } = criticPrompt(task, result, ctx.goal, lens)
    try {
      return await ctx.llm.chatJSON(messages, CriticVerdictSchema, { system })
    } catch {
      // 如果某个视角的 LLM 调用失败，默认拒绝
      return {
        passed: false,
        reasoning: `Lens "${lens}" evaluation failed — defaulting to rejected`,
        issues: [`${lens} evaluation could not be completed`],
        improvements: [],
      }
    }
  }
}
