---
name: loop-run
description: "运行 LoopEngineering-Core TypeScript 系统。当用户想要使用完整的 TypeScript 实现（带存储、记忆持久化、监控报告）时使用。需要先 npm install。"
argument-hint: <任务目标>
allowed-tools: [Read, Write, Edit, Bash, Agent, TaskCreate, TaskUpdate, TaskList]
---

# Loop Engineering — TypeScript Runtime

运行 LoopEngineering-Core 的 TypeScript 实现。

## 前置检查

用户给出的目标：$ARGUMENTS

首先检查项目是否已安装：

```bash
cd {项目路径} && ls node_modules/.package-lock.json 2>/dev/null || npm install
```

## 执行

```bash
cd {项目路径} && npx tsx src/index.ts "$ARGUMENTS"
```

## 输出解读

系统会输出：
- `[GoalAgent]` — 目标解析结果
- `[PlannerAgent]` — 任务拆解
- `[Executor]` — 每个任务的执行结果
- `[Critic]` — 3 视角对抗验证结果（3/3 通过 = PASS，否则 = FAIL）
- `[MemoryAgent]` — 经验沉淀
- `[Monitor]` — 统计报告

## 如果失败

1. 检查 `ANTHROPIC_API_KEY` 环境变量是否设置
2. 检查 `data/` 目录下的 JSON 文件了解执行状态
3. 可以用 `npm test` 先用 Mock 测试确认系统正常

## 环境变量

- `ANTHROPIC_API_KEY` — Claude API key（必须）
- `LLM_MODEL` — 模型名（默认 claude-sonnet-4-6）
- `MAX_ITERATIONS` — 最大迭代次数（默认 10）
