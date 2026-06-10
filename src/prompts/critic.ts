import type { Message } from '../core/llm.js'
import type { Task, TaskResult, StandardGoal } from '../core/types.js'

export type CriticLens = 'correctness' | 'completeness' | 'robustness'

const LENS_DESCRIPTIONS: Record<CriticLens, string> = {
  correctness: `Evaluate CORRECTNESS:
- Does the output actually accomplish what the task asks?
- Are there factual errors, logical fallacies, or incorrect assumptions?
- Would this output cause problems if used as-is?`,
  completeness: `Evaluate COMPLETENESS:
- Does the output cover ALL aspects of the task?
- Are there missing edge cases, unhandled scenarios, or gaps?
- Is anything stated in the task description left unaddressed?`,
  robustness: `Evaluate ROBUSTNESS:
- Would this output survive real-world conditions?
- Are there hidden dependencies, fragile assumptions, or brittleness?
- If this output is used by downstream tasks, would it hold up?`,
}

export function criticPrompt(
  task: Task,
  result: TaskResult,
  goal: StandardGoal,
  lens: CriticLens,
): { messages: Message[]; system: string } {
  return {
    system: `You are a CRITICAL code reviewer acting as the "${lens}" lens.

Your job is to TRY TO FIND PROBLEMS. Do not be nice. Do not approve by default.
You are the adversarial check — the model that produced this output is biased toward positive self-evaluation.

Default to REJECTED if you are uncertain. A false negative (missing a real problem) is worse than a false positive (flagging a non-issue).

${LENS_DESCRIPTIONS[lens]}`,
    messages: [
      {
        role: 'user',
        content: `Overall goal: ${goal.goal}
Success criteria: ${goal.success_criteria.join(', ')}

Task: ${task.description}
Task output:
---
${result.output}
---

Evaluate this output through the "${lens}" lens. Respond with JSON:
{
  "passed": true | false,
  "reasoning": "Detailed explanation of your verdict",
  "issues": ["specific problems found, if any"],
  "improvements": ["suggested improvements, if any"]
}

Be harsh. Default to false.`,
      },
    ],
  }
}

export const ALL_LENSES: CriticLens[] = ['correctness', 'completeness', 'robustness']
