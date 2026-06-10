import { randomUUID } from 'crypto'
import type { Store } from './store.js'
import type { LLMProvider } from './llm.js'
import type {
  StandardGoal,
  LoopState,
  Task,
  TaskResult,
  Feedback,
  SystemReport,
} from './types.js'
import { GoalAgent } from '../agents/goal.js'
import { PlannerAgent } from '../agents/planner.js'
import { ExecutorAgent } from '../agents/executor.js'
import { CriticAgent } from '../agents/critic.js'
import { MemoryAgent } from '../agents/memory.js'
import { MonitorAgent } from '../agents/monitor.js'

export interface LoopConfig {
  maxIterations?: number
  maxPlanningFailures?: number
  maxTaskRetries?: number
  verbose?: boolean
  onIterationStart?: (iteration: number) => void
  onTaskComplete?: (taskId: string, result: TaskResult, feedback: Feedback) => void
  onIterationEnd?: (iteration: number, report: SystemReport) => void
  onLoopComplete?: (state: LoopState) => void
}

interface AgentContext {
  store: Store
  llm: LLMProvider
  goal: StandardGoal
  iteration: number
  loop_id: string
}

// DAG 拓扑排序：返回按依赖顺序排列的任务
function topoSort(tasks: Task[]): Task[] {
  const byId = new Map(tasks.map(t => [t.task_id, t]))
  const visited = new Set<string>()
  const result: Task[] = []

  function visit(id: string) {
    if (visited.has(id)) return
    visited.add(id)
    const task = byId.get(id)
    if (!task) return
    for (const dep of task.dependencies) {
      visit(dep)
    }
    result.push(task)
  }

  for (const task of tasks) {
    visit(task.task_id)
  }
  return result
}

export class LoopController {
  private store: Store
  private llm: LLMProvider
  private config: Required<LoopConfig>

  private goalAgent: GoalAgent
  private plannerAgent: PlannerAgent
  private executorAgent: ExecutorAgent
  private criticAgent: CriticAgent
  private memoryAgent: MemoryAgent
  private monitorAgent: MonitorAgent

  constructor(store: Store, llm: LLMProvider, config: LoopConfig = {}) {
    this.store = store
    this.llm = llm
    this.config = {
      maxIterations: config.maxIterations ?? 10,
      maxPlanningFailures: config.maxPlanningFailures ?? 3,
      maxTaskRetries: config.maxTaskRetries ?? 2,
      verbose: config.verbose ?? true,
      onIterationStart: config.onIterationStart ?? (() => {}),
      onTaskComplete: config.onTaskComplete ?? (() => {}),
      onIterationEnd: config.onIterationEnd ?? (() => {}),
      onLoopComplete: config.onLoopComplete ?? (() => {}),
    }

    this.goalAgent = new GoalAgent()
    this.plannerAgent = new PlannerAgent()
    this.executorAgent = new ExecutorAgent()
    this.criticAgent = new CriticAgent()
    this.memoryAgent = new MemoryAgent()
    this.monitorAgent = new MonitorAgent()
  }

  async run(rawGoal: string): Promise<LoopState> {
    const loopId = randomUUID()
    const startedAt = new Date().toISOString()

    this.log(`\n${'='.repeat(60)}`)
    this.log(`Loop ${loopId} starting`)
    this.log(`Goal: ${rawGoal}`)
    this.log(`${'='.repeat(60)}\n`)

    // Step 1: GoalAgent
    this.log('[GoalAgent] Standardizing goal...')
    const goalResult = await this.goalAgent.run(
      { raw_goal: rawGoal },
      this.ctx(loopId, 0),
    )
    if (!goalResult.success) {
      return this.terminate(loopId, 'failed', 0, startedAt, `Goal standardization failed: ${goalResult.error}`)
    }
    const goal = goalResult.data.goal as StandardGoal
    this.log(`[GoalAgent] ✓ Goal: ${goal.goal}`)
    this.log(`[GoalAgent]   Criteria: ${goal.success_criteria.join(', ')}`)

    // 初始化 loop state
    let loopState: LoopState = {
      loop_id: loopId,
      goal,
      iteration: 0,
      max_iterations: this.config.maxIterations,
      status: 'running',
      started_at: startedAt,
      updated_at: startedAt,
    }
    await this.store.set('loops', loopId, loopState)

    // Main loop
    let planningFailures = 0

    for (let iter = 1; iter <= this.config.maxIterations; iter++) {
      loopState = { ...loopState, iteration: iter, updated_at: new Date().toISOString() }
      await this.store.set('loops', loopId, loopState)

      this.config.onIterationStart(iter)
      this.log(`\n--- Iteration ${iter}/${this.config.maxIterations} ---`)

      // Step 2: PlannerAgent（带 DAG 拓扑排序）
      this.log('[PlannerAgent] Planning tasks...')
      const planResult = await this.plannerAgent.run({}, this.ctx(loopId, iter, goal))
      if (!planResult.success) {
        this.log(`[PlannerAgent] ✗ Failed: ${planResult.error}`)
        planningFailures++
        if (planningFailures >= this.config.maxPlanningFailures) {
          return this.terminate(loopId, 'failed', iter, startedAt, 'Too many consecutive planning failures', goal)
        }
        continue
      }
      planningFailures = 0

      const rawTasks = planResult.data.tasks as Task[]
      if (rawTasks.length === 0) {
        this.log('[PlannerAgent] ⚠ No tasks generated — goal may already be satisfied')
        return this.terminate(loopId, 'completed', iter, startedAt, undefined, goal)
      }

      const tasks = topoSort(rawTasks)
      this.log(`[PlannerAgent] ✓ Planned ${tasks.length} tasks (topologically sorted)`)
      for (const t of tasks) {
        this.log(`  ${t.task_id}: ${t.description} (deps: [${t.dependencies.join(', ')}])`)
      }

      // Step 3: 执行 + 验证每个任务
      let iterFailures = 0
      const iterTasks: string[] = []

      for (const task of tasks) {
        iterTasks.push(task.task_id)
        this.log(`\n  [Executor] Running: ${task.task_id} — ${task.description}`)

        // 检查依赖
        const depsOk = await this.checkDependencies(task, iter)
        if (!depsOk) {
          this.log(`  [Executor] ⏭ Skipped: dependencies not met`)
          continue
        }

        // 执行 + 验证（带重试）
        const { success, retries } = await this.executeAndVerify(task, iter, goal, loopId)
        if (success) {
          this.log(`  ✓ ${task.task_id} passed (after ${retries} retries)`)
        } else {
          this.log(`  ✗ ${task.task_id} failed after ${retries} retries`)
          iterFailures++
        }
      }

      // Step 4: MemoryAgent — 沉淀
      this.log('\n[MemoryAgent] Saving experience...')
      await this.memoryAgent.run({ iteration: iter }, this.ctx(loopId, iter, goal))

      // Step 5: MonitorAgent — 监控
      this.log('[MonitorAgent] Generating report...')
      const monitorResult = await this.monitorAgent.run({ iteration: iter }, this.ctx(loopId, iter, goal))
      if (monitorResult.success) {
        const report = monitorResult.data.report as SystemReport
        this.config.onIterationEnd(iter, report)
        this.log(`[Monitor] Tasks: ${report.completed}/${report.total_tasks} completed, ${report.failed} failed`)
        this.log(`[Monitor] Tokens: ${report.total_tokens}, Duration: ${report.total_duration_ms}ms`)
        if (report.alerts.length > 0) {
          this.log(`[Monitor] ⚠ Alerts: ${report.alerts.join('; ')}`)
        }
      }

      // 终止条件检查
      if (iterFailures === 0 && tasks.length > 0) {
        const iterDone = await this.allTasksCompleted(iter)
        if (iterDone) {
          this.log('\n✓ All tasks completed successfully!')
          return this.terminate(loopId, 'completed', iter, startedAt, undefined, goal)
        }
      }
    }

    return this.terminate(loopId, 'max_iterations', this.config.maxIterations, startedAt, undefined, goal)
  }

  private async executeAndVerify(
    task: Task,
    iteration: number,
    goal: StandardGoal,
    loopId: string,
  ): Promise<{ success: boolean; retries: number }> {
    const ctx = this.ctx(loopId, iteration, goal)

    for (let retry = 0; retry <= this.config.maxTaskRetries; retry++) {
      if (retry > 0) {
        this.log(`  [Retry ${retry}/${this.config.maxTaskRetries}] Re-executing ${task.task_id}`)
      }

      // 执行
      const execResult = await this.executorAgent.run({ task, iteration }, ctx)
      if (!execResult.success) {
        this.log(`  [Executor] ✗ Failed: ${execResult.error}`)
        continue
      }

      const taskResult = execResult.data.task_result as TaskResult
      this.log(`  [Executor] ✓ ${taskResult.status}`)

      // 对抗验证
      this.log(`  [Critic] Evaluating (3 perspectives)...`)
      const criticResult = await this.criticAgent.run({ task_result: taskResult, iteration }, ctx)

      if (!criticResult.success) {
        this.log(`  [Critic] ✗ Evaluation failed: ${criticResult.error}`)
        continue
      }

      const feedback = criticResult.data.feedback as Feedback
      this.config.onTaskComplete(task.task_id, taskResult, feedback)

      if (feedback.passed) {
        this.log(`  [Critic] ✓ PASSED (${feedback.perspectives.filter(p => p.passed).length}/3 perspectives)`)
        return { success: true, retries: retry }
      } else {
        this.log(`  [Critic] ✗ REJECTED: ${feedback.issues.join('; ')}`)
        if (feedback.improvements.length > 0) {
          this.log(`  [Critic] Suggestions: ${feedback.improvements.join(', ')}`)
        }
      }
    }

    return { success: false, retries: this.config.maxTaskRetries }
  }

  private ctx(loopId: string, iteration: number, goal?: StandardGoal): AgentContext {
    return {
      store: this.store,
      llm: this.llm,
      goal: goal ?? { goal: '', constraints: [], success_criteria: [], priority: 'medium' },
      iteration,
      loop_id: loopId,
    }
  }

  private async checkDependencies(task: Task, iteration: number): Promise<boolean> {
    for (const depId of task.dependencies) {
      const dep = await this.store.get<Task>(`tasks_${iteration}`, depId)
      if (!dep || dep.status !== 'completed') return false
    }
    return true
  }

  private async allTasksCompleted(iteration: number): Promise<boolean> {
    const tasks = await this.store.list<Task>(`tasks_${iteration}`)
    return tasks.length > 0 && tasks.every(t => t.status === 'completed')
  }

  private terminate(
    loopId: string,
    status: LoopState['status'],
    iteration: number,
    startedAt: string,
    reason?: string,
    goal?: StandardGoal,
  ): LoopState {
    const state: LoopState = {
      loop_id: loopId,
      goal: goal ?? { goal: '', constraints: [], success_criteria: [], priority: 'medium' },
      iteration,
      max_iterations: this.config.maxIterations,
      status,
      started_at: startedAt,
      updated_at: new Date().toISOString(),
    }

    // 持久化最终状态
    this.store.set('loops', loopId, state).catch(() => {})

    this.config.onLoopComplete(state)

    this.log(`\n${'='.repeat(60)}`)
    this.log(`Loop ${status.toUpperCase()}`)
    if (reason) this.log(`Reason: ${reason}`)
    this.log(`Iterations: ${iteration}`)
    this.log(`${'='.repeat(60)}\n`)

    return state
  }

  private log(msg: string): void {
    if (this.config.verbose) {
      console.log(msg)
    }
  }
}
