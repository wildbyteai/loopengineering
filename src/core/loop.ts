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
  maxConsecutiveFailures?: number
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
      maxConsecutiveFailures: config.maxConsecutiveFailures ?? 3,
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

    // Step 1: GoalAgent — 标准化目标
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
    const loopState: LoopState = {
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
    let consecutiveFailures = 0

    for (let iter = 1; iter <= this.config.maxIterations; iter++) {
      loopState.iteration = iter
      loopState.updated_at = new Date().toISOString()
      await this.store.set('loops', loopId, loopState)

      this.config.onIterationStart(iter)
      this.log(`\n--- Iteration ${iter}/${this.config.maxIterations} ---`)

      // Step 2: PlannerAgent — 规划
      this.log('[PlannerAgent] Planning tasks...')
      const planResult = await this.plannerAgent.run({}, this.ctx(loopId, iter, goal))
      if (!planResult.success) {
        this.log(`[PlannerAgent] ✗ Failed: ${planResult.error}`)
        consecutiveFailures++
        if (consecutiveFailures >= this.config.maxConsecutiveFailures) {
          return this.terminate(loopId, 'failed', iter, startedAt, 'Too many consecutive planning failures')
        }
        continue
      }
      const tasks = planResult.data.tasks as Task[]
      this.log(`[PlannerAgent] ✓ Planned ${tasks.length} tasks`)

      // Step 3: 执行 + 验证每个任务
      let iterFailures = 0
      for (const task of tasks) {
        this.log(`\n  [Executor] Running: ${task.task_id} — ${task.description}`)

        // 检查依赖
        const depsOk = await this.checkDependencies(task)
        if (!depsOk) {
          this.log(`  [Executor] ⏭ Skipped: dependencies not met`)
          continue
        }

        const execResult = await this.executorAgent.run({ task }, this.ctx(loopId, iter, goal))
        if (!execResult.success) {
          this.log(`  [Executor] ✗ Failed: ${execResult.error}`)
          iterFailures++
          consecutiveFailures++
          continue
        }

        const taskResult = execResult.data.task_result as TaskResult
        this.log(`  [Executor] ✓ ${taskResult.status}`)

        // Step 4: CriticAgent — 对抗验证
        this.log(`  [Critic] Evaluating (3 perspectives)...`)
        const criticResult = await this.criticAgent.run(
          { task_result: taskResult },
          this.ctx(loopId, iter, goal),
        )

        if (!criticResult.success) {
          this.log(`  [Critic] ✗ Evaluation failed: ${criticResult.error}`)
          iterFailures++
          continue
        }

        const feedback = criticResult.data.feedback as Feedback
        this.config.onTaskComplete(task.task_id, taskResult, feedback)

        if (feedback.passed) {
          this.log(`  [Critic] ✓ PASSED (${feedback.perspectives.filter(p => p.passed).length}/3 perspectives)`)
          consecutiveFailures = 0
        } else {
          this.log(`  [Critic] ✗ REJECTED: ${feedback.issues.join('; ')}`)
          iterFailures++
          consecutiveFailures++
        }

        if (feedback.improvements.length > 0) {
          this.log(`  [Critic] Suggestions: ${feedback.improvements.join(', ')}`)
        }
      }

      // Step 5: MemoryAgent — 沉淀
      this.log('\n[MemoryAgent] Saving experience...')
      await this.memoryAgent.run({}, this.ctx(loopId, iter, goal))

      // Step 6: MonitorAgent — 监控
      this.log('[MonitorAgent] Generating report...')
      const monitorResult = await this.monitorAgent.run({}, this.ctx(loopId, iter, goal))
      if (monitorResult.success) {
        const report = monitorResult.data.report as SystemReport
        this.config.onIterationEnd(iter, report)
        this.log(`[Monitor] Tasks: ${report.completed}/${report.total_tasks} completed, ${report.failed} failed`)
        if (report.alerts.length > 0) {
          this.log(`[Monitor] ⚠ Alerts: ${report.alerts.join('; ')}`)
        }
      }

      // 终止条件检查
      if (iterFailures === 0 && tasks.length > 0) {
        const allDone = await this.allTasksCompleted()
        if (allDone) {
          this.log('\n✓ All tasks completed successfully!')
          return this.terminate(loopId, 'completed', iter, startedAt)
        }
      }

      if (consecutiveFailures >= this.config.maxConsecutiveFailures) {
        return this.terminate(loopId, 'failed', iter, startedAt, `${consecutiveFailures} consecutive failures`)
      }
    }

    return this.terminate(loopId, 'max_iterations', this.config.maxIterations, startedAt)
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

  private async checkDependencies(task: Task): Promise<boolean> {
    for (const depId of task.dependencies) {
      const dep = await this.store.get<Task>('tasks', depId)
      if (!dep || dep.status !== 'completed') return false
    }
    return true
  }

  private async allTasksCompleted(): Promise<boolean> {
    const tasks = await this.store.list<Task>('tasks')
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
