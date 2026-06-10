import { BaseAgent } from './base.js'
import type { AgentContext, AgentResult, TaskResult, Feedback, MemoryEntry } from '../core/types.js'
import { randomUUID } from 'crypto'

export class MemoryAgent extends BaseAgent {
  readonly name = 'MemoryAgent'

  async run(
    input: { iteration: number },
    ctx: AgentContext,
  ): Promise<AgentResult> {
    const start = Date.now()
    const { iteration } = input

    try {
      const results = await ctx.store.list<TaskResult>(`task_results_${iteration}`)
      const feedbacks = await ctx.store.list<Feedback>(`feedback_${iteration}`)

      let newEntries = 0

      for (const result of results) {
        const feedback = feedbacks.find(f => f.task_id === result.task_id)

        const existing = await ctx.store.list<MemoryEntry>('memory', m => m.task_id === result.task_id)
        if (existing.length > 0) continue

        const summary = feedback
          ? `Task: ${result.task_id} | Status: ${result.status} | Passed: ${feedback.passed} | Issues: ${feedback.issues.join('; ') || 'none'}`
          : `Task: ${result.task_id} | Status: ${result.status}`

        const entry: MemoryEntry = {
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          task_id: result.task_id,
          task_summary: summary,
          outcome: result.status === 'success' && (feedback?.passed ?? true)
            ? 'success'
            : `failed: ${feedback?.issues.join('; ') ?? 'unknown reason'}`,
          lessons: feedback?.improvements ?? [],
          keywords: this.extractKeywords(summary + ' ' + result.output),
        }

        await ctx.store.set('memory', entry.id, entry)
        newEntries++
      }

      return this.ok({ new_entries: newEntries }, undefined, this.timing(start))
    } catch (err) {
      return this.fail(`MemoryAgent failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async recall(goal: string, ctx: AgentContext): Promise<MemoryEntry[]> {
    const all = await ctx.store.list<MemoryEntry>('memory')
    const keywords = this.extractKeywords(goal)

    return all
      .filter(m =>
        m.keywords.some(k => keywords.includes(k)) ||
        m.task_summary.toLowerCase().includes(goal.toLowerCase().slice(0, 50)),
      )
      .slice(-20)
  }

  private extractKeywords(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 30)
  }
}
