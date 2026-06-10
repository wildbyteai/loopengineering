import { BaseAgent } from './base.js'
import type { AgentContext, AgentResult, Task, TaskResult } from '../core/types.js'
import { executorPrompt } from '../prompts/executor.js'
import { z } from 'zod'

const ExecutorOutputSchema = z.object({
  output: z.string(),
  status: z.enum(['success', 'failed']),
  reasoning: z.string().optional(),
})

export class ExecutorAgent extends BaseAgent {
  readonly name = 'ExecutorAgent'

  async run(
    input: { task: Task },
    ctx: AgentContext,
  ): Promise<AgentResult> {
    const start = Date.now()
    const { task } = input

    try {
      // 标记任务为 in_progress
      await ctx.store.set('tasks', task.task_id, {
        ...task,
        status: 'in_progress',
        updated_at: new Date().toISOString(),
      })

      const { messages, system } = executorPrompt(task, ctx.goal)
      const parsed = await ctx.llm.chatJSON(messages, ExecutorOutputSchema, { system })

      const taskResult: TaskResult = {
        task_id: task.task_id,
        output: parsed.output,
        status: parsed.status,
        metadata: {
          duration_ms: this.timing(start),
        },
        created_at: new Date().toISOString(),
      }

      // 写入结果
      await ctx.store.set('task_results', task.task_id, taskResult)

      // 更新任务状态
      await ctx.store.set('tasks', task.task_id, {
        ...task,
        status: parsed.status === 'success' ? 'completed' : 'failed',
        updated_at: new Date().toISOString(),
      })

      return this.ok(
        { task_result: taskResult, reasoning: parsed.reasoning },
        undefined,
        this.timing(start),
      )
    } catch (err) {
      // 标记任务失败
      await ctx.store.set('tasks', task.task_id, {
        ...task,
        status: 'failed',
        updated_at: new Date().toISOString(),
      })
      return this.fail(`ExecutorAgent failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
