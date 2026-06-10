import { z } from 'zod'

// ============================================================
// StandardGoal
// ============================================================
export const StandardGoalSchema = z.object({
  goal: z.string(),
  constraints: z.array(z.string()),
  success_criteria: z.array(z.string()),
  priority: z.enum(['high', 'medium', 'low']),
})
export type StandardGoal = z.infer<typeof StandardGoalSchema>

// ============================================================
// Task
// ============================================================
export const TaskStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'failed'])
export type TaskStatus = z.infer<typeof TaskStatusSchema>

export const TaskSchema = z.object({
  task_id: z.string(),
  description: z.string(),
  priority: z.number().int().min(0).max(10),
  dependencies: z.array(z.string()),
  status: TaskStatusSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})
export type Task = z.infer<typeof TaskSchema>

// ============================================================
// TaskResult
// ============================================================
export const TaskResultSchema = z.object({
  task_id: z.string(),
  output: z.string(),
  status: z.enum(['success', 'failed']),
  metadata: z.object({
    tokens_used: z.number().optional(),
    duration_ms: z.number().optional(),
    model: z.string().optional(),
  }),
  created_at: z.string().datetime(),
})
export type TaskResult = z.infer<typeof TaskResultSchema>

// ============================================================
// Feedback
// ============================================================
export const FeedbackSeveritySchema = z.enum(['critical', 'major', 'minor', 'info'])
export type FeedbackSeverity = z.infer<typeof FeedbackSeveritySchema>

export const FeedbackSchema = z.object({
  task_id: z.string(),
  passed: z.boolean(),
  issues: z.array(z.string()),
  improvements: z.array(z.string()),
  severity: FeedbackSeveritySchema,
  perspectives: z.array(z.object({
    lens: z.string(),
    passed: z.boolean(),
    reasoning: z.string(),
  })),
  created_at: z.string().datetime(),
})
export type Feedback = z.infer<typeof FeedbackSchema>

// ============================================================
// MemoryEntry
// ============================================================
export const MemoryEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string().datetime(),
  task_id: z.string(),
  task_summary: z.string(),
  outcome: z.string(),
  lessons: z.array(z.string()),
  keywords: z.array(z.string()),
})
export type MemoryEntry = z.infer<typeof MemoryEntrySchema>

// ============================================================
// SystemReport (MonitorAgent output)
// ============================================================
export const SystemReportSchema = z.object({
  iteration: z.number(),
  total_tasks: z.number(),
  completed: z.number(),
  failed: z.number(),
  pending: z.number(),
  in_progress: z.number(),
  success_rate: z.number(),
  total_tokens: z.number(),
  total_duration_ms: z.number(),
  alerts: z.array(z.string()),
  created_at: z.string().datetime(),
})
export type SystemReport = z.infer<typeof SystemReportSchema>

// ============================================================
// LoopState
// ============================================================
export const LoopStatusSchema = z.enum(['running', 'completed', 'failed', 'max_iterations'])
export type LoopStatus = z.infer<typeof LoopStatusSchema>

export const LoopStateSchema = z.object({
  loop_id: z.string(),
  goal: StandardGoalSchema,
  iteration: z.number(),
  max_iterations: z.number(),
  status: LoopStatusSchema,
  started_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})
export type LoopState = z.infer<typeof LoopStateSchema>

// ============================================================
// AgentResult
// ============================================================
export const AgentResultSchema = z.object({
  agent_name: z.string(),
  success: z.boolean(),
  data: z.record(z.unknown()),
  error: z.string().optional(),
  tokens_used: z.number().optional(),
  duration_ms: z.number().optional(),
})
export type AgentResult = z.infer<typeof AgentResultSchema>

// ============================================================
// AgentContext
// ============================================================
export interface AgentContext {
  store: import('./store.js').Store
  llm: import('./llm.js').LLMProvider
  goal: StandardGoal
  iteration: number
  loop_id: string
}
