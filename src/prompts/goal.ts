import type { Message } from '../core/llm.js'

export function goalPrompt(rawGoal: string): { messages: Message[]; system: string } {
  return {
    system: `You are a goal standardization agent. Your job is to parse a raw human goal into a structured, machine-executable format.

You must extract:
- goal: A clear, one-sentence description of what needs to be accomplished
- constraints: Explicit boundaries and limitations
- success_criteria: Observable, verifiable conditions that indicate success
- priority: high / medium / low based on urgency and impact

Be specific. "Make it better" is not a success criterion. "Response time under 200ms" is.`,
    messages: [
      {
        role: 'user',
        content: `Parse this goal into structured JSON:

"${rawGoal}"

Respond with JSON in this exact format:
{
  "goal": "...",
  "constraints": ["..."],
  "success_criteria": ["..."],
  "priority": "high" | "medium" | "low"
}`,
      },
    ],
  }
}
