#!/usr/bin/env node

import { JsonFileStore } from './core/store.js'
import { ClaudeProvider } from './core/llm.js'
import { LoopController } from './core/loop.js'

async function main(): Promise<void> {
  const goal = process.argv[2]
  if (!goal) {
    console.error('Usage: loopengineering <goal>')
    console.error('Example: loopengineering "Create a REST API with user authentication"')
    process.exit(1)
  }

  const store = new JsonFileStore('./data')
  const llm = new ClaudeProvider({
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.LLM_MODEL,
  })

  const maxIterations = parseInt(process.env.MAX_ITERATIONS ?? '10', 10)

  const loop = new LoopController(store, llm, {
    maxIterations,
    verbose: true,
    onIterationStart: (iter) => {
      console.log(`\n🔄 Starting iteration ${iter}`)
    },
    onTaskComplete: (taskId, result, feedback) => {
      const icon = feedback.passed ? '✅' : '❌'
      console.log(`  ${icon} ${taskId}: ${result.status} (critic: ${feedback.passed ? 'PASS' : 'FAIL'})`)
    },
    onIterationEnd: (iter, report) => {
      console.log(`\n📊 Iteration ${iter} report:`)
      console.log(`   Tasks: ${report.completed}/${report.total_tasks} completed`)
      console.log(`   Tokens: ${report.total_tokens}`)
      console.log(`   Duration: ${report.total_duration_ms}ms`)
      if (report.alerts.length > 0) {
        console.log(`   ⚠️  Alerts: ${report.alerts.join(', ')}`)
      }
    },
    onLoopComplete: (state) => {
      console.log(`\n🏁 Loop ${state.status} after ${state.iteration} iterations`)
    },
  })

  const result = await loop.run(goal)
  process.exit(result.status === 'completed' ? 0 : 1)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
