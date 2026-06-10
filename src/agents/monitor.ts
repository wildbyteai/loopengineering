import { BaseAgent } from './base.js'
import type { AgentContext, AgentResult, Task, SystemReport } from '../core/types.js'

export class MonitorAgent extends BaseAgent {
  readonly name = 'MonitorAgent'

  async run(
    _input: Record<string, unknown>,
    ctx: AgentContext,
  ): Promise<AgentResult> {
    const start = Date.now()

    try {
      const tasks = await ctx.store.list<Task>('tasks')
      const results = await ctx.store.list<{ status: string; metadata?: { tokens_used?: number; duration_ms?: number } }>('task_results')

      const total = tasks.length
      const completed = tasks.filter(t => t.status === 'completed').length
      const failed = tasks.filter(t => t.status === 'failed').length
      const inProgress = tasks.filter(t => t.status === 'in_progress').length
      const pending = tasks.filter(t => t.status === 'pending').length

      const totalTokens = results.reduce((sum, r) => sum + (r.metadata?.tokens_used ?? 0), 0)
      const totalDuration = results.reduce((sum, r) => sum + (r.metadata?.duration_ms ?? 0), 0)

      const alerts: string[] = []

      // 异常检测
      if (total > 0 && failed / total > 0.5) {
        alerts.push(`High failure rate: ${failed}/${total} tasks failed (${Math.round(failed / total * 100)}%)`)
      }
      if (inProgress > 3) {
        alerts.push(`Too many in-progress tasks: ${inProgress} (possible deadlock)`)
      }
      if (ctx.iteration >= ctx.goal.constraints.length * 3 && completed < total * 0.3) {
        alerts.push('Slow progress: many iterations with low completion rate')
      }

      const report: SystemReport = {
        iteration: ctx.iteration,
        total_tasks: total,
        completed,
        failed,
        pending,
        in_progress: inProgress,
        success_rate: total > 0 ? completed / total : 0,
        total_tokens: totalTokens,
        total_duration_ms: totalDuration,
        alerts,
        created_at: new Date().toISOString(),
      }

      // 存储报告
      await ctx.store.set('reports', `iter-${ctx.iteration}`, report)

      return this.ok({ report }, undefined, this.timing(start))
    } catch (err) {
      return this.fail(`MonitorAgent failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}
