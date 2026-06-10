import { BaseAgent } from './base.js'
import type { AgentContext, AgentResult, Task, MemoryEntry, TaskResult } from '../core/types.js'
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
      // 读取记忆
      const memories = await ctx.store.list<MemoryEntry>('memory')

      // 读取失败的任务
      const failedResults = await ctx.store.list<TaskResult>('task_results', r => r.status === 'failed')
      const failedTaskIds = failedResults.map(r => r.task_id)

      const { messages, system } = plannerPrompt(ctx.goal, memories.slice(-10), failedTaskIds)
      const parsed = await ctx.llm.chatJSON(messages, PlannerOutputSchema, { system })

      const now = new Date().toISOString()
      const tasks: Task[] = parsed.tasks.map(t => ({
        ...t,
        status: 'pending' as const,
        created_at: now,
        updated_at: now,
      }))

      // 写入 task queue
      for (const task of tasks) {
        await ctx.store.set('tasks', task.task_id, task)
      }

      return this.ok({ tasks, task_count: tasks.length }, undefined, this.timing(start))
    } catch (err) {
      return this.fail(`PlannerAgent failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
