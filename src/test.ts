import { JsonFileStore } from './core/store.js'
import { MockProvider, type Message, type LLMOptions } from './core/llm.js'
import { LoopController } from './core/loop.js'
import { rm } from 'fs/promises'

const TEST_DATA_DIR = './data-test'

// Mock responses for each agent
function mockGoalResponse(): string {
  return JSON.stringify({
    goal: 'Build a simple calculator CLI tool',
    constraints: ['Must be TypeScript', 'No external dependencies'],
    success_criteria: ['Supports +, -, *, / operations', 'Handles division by zero'],
    priority: 'medium',
  })
}

let plannerCallCount = 0
function mockPlannerResponse(): string {
  plannerCallCount++
  if (plannerCallCount === 1) {
    return JSON.stringify({
      tasks: [
        {
          task_id: 't1',
          description: 'Create project structure and entry point',
          priority: 0,
          dependencies: [],
        },
        {
          task_id: 't2',
          description: 'Implement arithmetic operations (+, -, *, /)',
          priority: 1,
          dependencies: ['t1'],
        },
        {
          task_id: 't3',
          description: 'Add input validation and error handling',
          priority: 2,
          dependencies: ['t2'],
        },
      ],
    })
  }
  // Second iteration: all done
  return JSON.stringify({ tasks: [] })
}

let executorCallCount = 0
function mockExecutorResponse(): string {
  executorCallCount++
  const outputs = [
    'Created src/index.ts with CLI entry point, src/calculator.ts with operation dispatcher',
    'Implemented add(), subtract(), multiply(), divide() functions with TypeScript types',
    'Added validation: check numeric inputs, handle division by zero with descriptive error',
  ]
  return JSON.stringify({
    output: outputs[(executorCallCount - 1) % outputs.length],
    status: 'success',
    reasoning: 'Task completed as specified',
  })
}

function mockCriticResponse(): string {
  return JSON.stringify({
    passed: true,
    reasoning: 'Output meets requirements. No issues found.',
    issues: [],
    improvements: [],
  })
}

async function runTest(): Promise<void> {
  console.log('🧪 LoopEngineering-Core Integration Test\n')

  // Cleanup
  await rm(TEST_DATA_DIR, { recursive: true, force: true })

  const store = new JsonFileStore(TEST_DATA_DIR)

  // Build mock provider with sequential responses
  const mockResponses = [
    mockGoalResponse,       // GoalAgent
    mockPlannerResponse,    // PlannerAgent
    mockExecutorResponse,   // Executor t1
    mockCriticResponse,     // Critic t1 (correctness)
    mockCriticResponse,     // Critic t1 (completeness)
    mockCriticResponse,     // Critic t1 (robustness)
    mockExecutorResponse,   // Executor t2
    mockCriticResponse,     // Critic t2 (correctness)
    mockCriticResponse,     // Critic t2 (completeness)
    mockCriticResponse,     // Critic t2 (robustness)
    mockExecutorResponse,   // Executor t3
    mockCriticResponse,     // Critic t3 (correctness)
    mockCriticResponse,     // Critic t3 (completeness)
    mockCriticResponse,     // Critic t3 (robustness)
    // MemoryAgent (no LLM call)
    // MonitorAgent (no LLM call)
    mockPlannerResponse,    // PlannerAgent (iteration 2)
  ]

  const llm = new MockProvider(
    mockResponses.map(fn => (_messages: Message[], _options?: LLMOptions) => fn()),
  )

  const loop = new LoopController(store, llm, {
    maxIterations: 3,
    verbose: true,
    onLoopComplete: (state) => {
      console.log(`\n✅ Loop completed with status: ${state.status}`)
    },
  })

  const result = await loop.run('Build a simple calculator CLI tool in TypeScript')

  // Verify
  console.log('\n--- Verification ---')
  console.log(`Loop status: ${result.status}`)
  console.log(`Iterations: ${result.iteration}`)

  const tasks = await store.list('tasks')
  console.log(`Tasks in store: ${tasks.length}`)

  const results = await store.list('task_results')
  console.log(`Task results: ${results.length}`)

  const feedback = await store.list('feedback')
  console.log(`Feedback entries: ${feedback.length}`)

  const memory = await store.list('memory')
  console.log(`Memory entries: ${memory.length}`)

  const reports = await store.list('reports')
  console.log(`Monitor reports: ${reports.length}`)

  if (result.status === 'completed') {
    console.log('\n🎉 All tests passed!')
  } else {
    console.log(`\n⚠️  Loop ended with status: ${result.status}`)
  }

  // Cleanup
  await rm(TEST_DATA_DIR, { recursive: true, force: true })
}

runTest().catch(err => {
  console.error('Test failed:', err)
  process.exit(1)
})
