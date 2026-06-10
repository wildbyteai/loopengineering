import { BaseAgent } from './base.js'
import type { AgentContext, AgentResult, Task, TaskResult } from '../core/types.js'
import { TaskSchema } from '../core/types.js'
import { plannerPrompt } from '../prompts/planner.js'
import { z } from 'zod'

const PlannerOutputSchema = z.object({
  tasks: z.array(TaskSchema.omit({ status: true, created_at: true, updated_at: true })),
})

export class PlannerAgent extends BaseAgent {
  readonly name = 'PlannerAgent'

  async run(
    _input: Record<string, unknown>,
    ctx: AgentContext,
  ): Promise<AgentResult> {
    const start = Date.now()

    try {
      // 读取相关记忆（语义检索）
      const memoryAgent = new (await import('./memory.js')).MemoryAgent()
      const memories = await memoryAgent.recall(ctx.goal.goal, ctx)

      // 读取失败的任务
      const failedResults = await ctx.store.list<TaskResult>(
        `task_results_${ctx.iteration - 1 > 0 ? ctx.iteration - 1 : 1}`,
        r => r.status === 'failed',
      )
      const failedTaskIds = failedResults.map(r => r.task_id)

      const { messages, system } = plannerPrompt(ctx.goal, memories.slice(-10), failedTaskIds)
      const resp = await ctx.llm.chat(messages, { system })
      const parsed = PlannerOutputSchema.parse(JSON.parse(resp.text))

      const now = new Date().toISOString()
      const iterationCollection = `tasks_${ctx.iteration}`
      const tasks: Task[] = parsed.tasks.map(t => ({
        ...t,
        status: 'pending' as const,
        created_at: now,
        updated_at: now,
      }))

      for (const task of tasks) {
        await ctx.store.set(iterationCollection, task.task_id, task)
      }

      return this.ok(
        { tasks, task_count: tasks.length },
        resp.usage.input_tokens + resp.usage.output_tokens,
        this.timing(start),
      )
    } catch (err) {
      return this.fail(`PlannerAgent failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
