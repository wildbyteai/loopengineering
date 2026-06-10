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
    input: { task: Task; iteration: number },
    ctx: AgentContext,
  ): Promise<AgentResult> {
    const start = Date.now()
    const { task, iteration } = input
    const taskCollection = `tasks_${iteration}`
    const resultCollection = `task_results_${iteration}`

    try {
      // 标记 in_progress
      await ctx.store.set(taskCollection, task.task_id, {
        ...task,
        status: 'in_progress',
        updated_at: new Date().toISOString(),
      })

      const { messages, system } = executorPrompt(task, ctx.goal)
      const resp = await ctx.llm.chat(messages, { system })
      const parsed = ExecutorOutputSchema.parse(JSON.parse(resp.text))

      const taskResult: TaskResult = {
        task_id: task.task_id,
        output: parsed.output,
        status: parsed.status,
        metadata: {
          tokens_used: resp.usage.input_tokens + resp.usage.output_tokens,
          duration_ms: this.timing(start),
        },
        created_at: new Date().toISOString(),
      }

      await ctx.store.set(resultCollection, task.task_id, taskResult)
      await ctx.store.set(taskCollection, task.task_id, {
        ...task,
        status: parsed.status === 'success' ? 'completed' : 'failed',
        updated_at: new Date().toISOString(),
      })

      return this.ok(
        { task_result: taskResult, reasoning: parsed.reasoning },
        resp.usage.input_tokens + resp.usage.output_tokens,
        this.timing(start),
      )
    } catch (err) {
      await ctx.store.set(taskCollection, task.task_id, {
        ...task,
        status: 'failed',
        updated_at: new Date().toISOString(),
      })
      return this.fail(`ExecutorAgent failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
