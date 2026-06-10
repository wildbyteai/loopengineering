import type { Message } from '../core/llm.js'
import type { StandardGoal, MemoryEntry } from '../core/types.js'

export function plannerPrompt(
  goal: StandardGoal,
  memories: MemoryEntry[],
  failedTasks: string[],
): { messages: Message[]; system: string } {
  const memoryBlock = memories.length > 0
    ? `\n\nRelevant past experiences:\n${memories.map(m =>
        `- [${m.task_id}] ${m.task_summary} → ${m.outcome}\n  Lessons: ${m.lessons.join(', ')}`
      ).join('\n')}`
    : ''

  const failureBlock = failedTasks.length > 0
    ? `\n\nAVOID these failed approaches:\n${failedTasks.map(f => `- ${f}`).join('\n')}`
    : ''

  return {
    system: `You are a task planning agent. Your job is to decompose a goal into executable sub-tasks with explicit dependencies.

Rules:
- Each task must be independently executable and independently verifiable
- Dependencies between tasks must be EXPLICIT — never assume implicit ordering
- Prioritize tasks: critical path first
- If past failures exist, design tasks that avoid those paths
- Keep tasks atomic: one clear action per task
- Max 10 tasks per iteration. If more are needed, group them.`,
    messages: [
      {
        role: 'user',
        content: `Goal: ${goal.goal}

Constraints: ${goal.constraints.join(', ') || 'none'}
Success criteria: ${goal.success_criteria.join(', ')}${memoryBlock}${failureBlock}

Decompose into tasks. Respond with JSON:
{
  "tasks": [
    {
      "task_id": "t1",
      "description": "...",
      "priority": 0,
      "dependencies": []
    }
  ]
}

priority: 0 = highest, 10 = lowest.
dependencies: list of task_ids that must complete before this one can start.`,
      },
    ],
  }
}
