import type { Message } from '../core/llm.js'
import type { Task, StandardGoal } from '../core/types.js'

export function executorPrompt(
  task: Task,
  goal: StandardGoal,
): { messages: Message[]; system: string } {
  return {
    system: `You are a task execution agent. Execute the given task precisely and produce a concrete result.

Rules:
- Focus ONLY on the assigned task, not the entire goal
- Produce a concrete, verifiable output
- If the task requires code, write the code
- If the task requires analysis, provide structured analysis
- If the task requires a decision, state your decision with reasoning
- Report failures honestly — do not claim success if the task is incomplete`,
    messages: [
      {
        role: 'user',
        content: `Overall goal: ${goal.goal}

Task to execute:
- ID: ${task.task_id}
- Description: ${task.description}
- Priority: ${task.priority}
- Dependencies completed: ${task.dependencies.length === 0 ? 'none (first task)' : task.dependencies.join(', ')}

Execute this task. Respond with JSON:
{
  "output": "The result of executing this task",
  "status": "success" | "failed",
  "reasoning": "Brief explanation of what you did and why"
}`,
      },
    ],
  }
}
