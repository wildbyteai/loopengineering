# LoopEngineering-Core v1.0 系统规范

> 构建一个通用 Loop Engineering 系统，通过闭环机制实现任务的持续规划、执行、验证与优化。

## 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                    LoopController                        │
│            (闭环调度核心 · 终止条件判断)                    │
└──────────┬──────────────────────────────────┬───────────┘
           │                                  │
           ▼                                  ▼
┌──────────────────┐                ┌──────────────────┐
│   MonitorAgent   │                │   GoalAgent      │
│   (系统监控)      │                │   (目标标准化)    │
└──────────────────┘                └────────┬─────────┘
                                             │
                                             ▼
                                    ┌──────────────────┐
                                    │  PlannerAgent    │
                              ┌────▶│  (规划与拆解)     │
                              │     └────────┬─────────┘
                              │              │
                              │              ▼
                              │     ┌──────────────────┐
                              │     │   TaskQueue      │
                              │     └────────┬─────────┘
                              │              │
                              │              ▼
                              │     ┌──────────────────┐
                              │     │  ExecutorAgent   │
                              │     │  (任务执行)       │
                              │     └────────┬─────────┘
                              │              │
                              │              ▼
                              │     ┌──────────────────┐
                              │     │ TaskResultStore  │
                              │     └────────┬─────────┘
                              │              │
                              │              ▼
                              │     ┌──────────────────┐
                              │     │  CriticAgent     │
                              │     │  (对抗验证)       │
                              │     └────────┬─────────┘
                              │              │
                              │              ▼
                              │     ┌──────────────────┐
                              │     │  FeedbackQueue   │
                              │     └────────┬─────────┘
                              │              │
                              │              ▼
                              │     ┌──────────────────┐
                              └─────│  MemoryAgent     │
                                    │  (记忆与沉淀)     │
                                    └──────────────────┘
```

## 七个 Agent 定义

### 1. GoalAgent — 目标标准化

**职责**：将模糊的人类意图转化为机器可执行的结构化目标。

| 字段 | 说明 |
|------|------|
| 输入 | `raw_goal`（原始目标，自然语言） |
| 输出 | `standard_goal`（结构化 JSON） |

**任务**：
- 接收原始目标
- 解析约束、边界、成功标准
- 生成结构化标准目标 JSON
- 写入 `TaskQueue.initial_goal`

**设计意图**：这是人与系统之间的接口层。人不需要写精确的 prompt——GoalAgent 负责将模糊意图转化为精确规格。这正是 Addy Osmani 所说的"你设计系统，系统去 prompt agent"的第一步。

---

### 2. PlannerAgent — 任务规划与拆解

**职责**：将标准目标拆解为可独立执行、可独立验证的子任务。

| 字段 | 说明 |
|------|------|
| 输入 | `standard_goal` + `memory_context` |
| 输出 | `task_list` + `task_dag` |

**任务**：
- 读取标准目标与历史记忆
- 拆解为可执行子任务
- 定义任务优先级与依赖关系
- 生成 Task DAG（有向无环图）
- 写入 TaskQueue

**设计意图**：PlannerAgent 是 Loop 的"大脑"。它从 MemoryAgent 获取历史上下文，避免重复失败的路径。任务之间的依赖关系必须是显式的——不能靠 Executor 隐式推断。

---

### 3. ExecutorAgent — 任务执行

**职责**：执行具体的子任务，生成结构化结果。

| 字段 | 说明 |
|------|------|
| 输入 | `task`（单个任务） |
| 输出 | `task_result` |

**任务**：
- 从 TaskQueue 获取可执行任务
- 执行任务（调用模型/工具/API/代码）
- 生成结构化结果
- 写入 TaskResultStore

**设计意图**：Executor 是无状态的执行单元。它可以是任何工具——LLM 调用、代码运行、API 请求、文件操作。关键是它只负责执行，不负责判断结果好坏（那是 CriticAgent 的事）。

---

### 4. CriticAgent — 对抗验证

**职责**：独立于 Executor，对执行结果进行对抗性评估。

| 字段 | 说明 |
|------|------|
| 输入 | `task_result` + `standard_goal` |
| 输出 | `feedback` |

**任务**：
- 检查任务结果是否满足目标
- 识别错误、遗漏、逻辑问题
- 生成改进建议或失败原因
- 写入 FeedbackQueue

**设计意图**：**这是 Loop Engineering 与普通 agent 编排的核心区别。** CriticAgent 不是"review"——它是"尝试推翻"。Osmani 的原话：*"The model that wrote code is way too nice grading its own homework."* 写代码的 agent 和检查代码的 agent 必须分离。

实现要点：
- CriticAgent 应该使用与 ExecutorAgent **不同的 prompt、不同的视角、甚至不同的模型**
- 典型策略：correctness lens、security lens、performance lens 各一个 Critic
- 推翻需要多数票（如 2/3），防止偶发误判

---

### 5. MemoryAgent — 长期记忆与经验沉淀

**职责**：跨会话持久化知识，为 Planner 提供上下文。

| 字段 | 说明 |
|------|------|
| 输入 | `task_result` + `feedback` |
| 输出 | `memory_entry` + `retrieval_result` |

**任务**：
- 存储任务执行结果与反馈
- 维护任务历史与经验库
- 提供语义检索接口
- 为 Planner 提供上下文

**设计意图**：Osmani 指出 *"The agent forgets, the repo doesn't."* 模型在会话间没有长期记忆。MemoryAgent 将隐式知识显式化——这对应 Osmani 的 "intent debt" 概念：未外部化的意图在每次会话中都要重新付出代价。

实现要点：
- 存储格式：结构化 markdown + embedding 索引
- 记录"什么有效、什么失败、为什么"，而不仅仅是结果
- PlannerAgent 在每次规划前必须查询 MemoryAgent

---

### 6. MonitorAgent — 系统监控

**职责**：监控系统健康状态，提供可观测性。

| 字段 | 说明 |
|------|------|
| 输入 | `task_queue` + `execution_logs` |
| 输出 | `system_report` + `alerts` |

**任务**：
- 监控任务执行状态
- 统计成功率/失败率/循环次数
- 记录资源消耗（token 用量、时间、成本）
- 触发异常告警

**设计意图**：没有监控的 loop 是盲飞。MonitorAgent 让你能回答"这个 loop 在干什么、花了多少、效果如何"。它对应 Osmani 提到的资源约束——loop 会烧 token，你需要知道烧在哪里。

---

### 7. LoopController — 闭环调度核心

**职责**：系统的"心脏"，协调所有 agent 的运行节奏。

| 字段 | 说明 |
|------|------|
| 输入 | `goal` + `task_state` + `memory` + `monitor_report` |
| 输出 | `next_cycle_trigger` |

**任务**：
- 判断当前循环是否完成
- 协调 Planner / Executor / Critic 的调度
- 触发下一轮规划
- 控制终止条件
- 维持系统闭环运行

**设计意图**：LoopController 不做具体工作——它是元调度器。它决定"现在该哪个 agent 工作"以及"是否该停止"。

---

## 数据对象

### standard_goal
```json
{
  "goal": "要做什么",
  "constraints": ["边界条件列表"],
  "success_criteria": ["可验证的成功标准"],
  "priority": "high | medium | low"
}
```

### task
```json
{
  "task_id": "唯一标识",
  "description": "任务描述",
  "priority": 0,
  "dependencies": ["task_id_1", "task_id_2"],
  "status": "pending | in_progress | completed | failed"
}
```

### task_result
```json
{
  "task_id": "对应任务 ID",
  "output": "执行输出",
  "status": "success | failed",
  "metadata": {
    "tokens_used": 0,
    "duration_ms": 0,
    "model": "使用的模型"
  }
}
```

### feedback
```json
{
  "task_id": "对应任务 ID",
  "issues": ["发现的问题"],
  "improvements": ["改进建议"],
  "severity": "critical | major | minor | info"
}
```

### memory_entry
```json
{
  "timestamp": "ISO 8601",
  "task_summary": "任务摘要",
  "outcome": "成功/失败及原因",
  "embedding": [0.12, -0.34, "..."]
}
```

---

## 循环流程

```
GoalAgent          → 解析原始目标为 standard_goal
    ↓
PlannerAgent       → 读取 standard_goal + memory，生成 task_list + task_dag
    ↓
TaskQueue          → 任务排队，等待依赖满足
    ↓
ExecutorAgent      → 获取可执行 task，执行，写入 task_result
    ↓
TaskResultStore    → 存储执行结果
    ↓
CriticAgent        → 对抗验证 task_result vs standard_goal
    ↓
FeedbackQueue      → 存储验证反馈
    ↓
MemoryAgent        → 沉淀经验，更新记忆
    ↓
PlannerAgent       → 基于反馈 + 记忆，重新规划下一轮
    ↓
LoopController     → 判断是否终止或继续
```

## 终止条件

| 条件 | 说明 |
|------|------|
| `goal_successfully_completed` | CriticAgent 确认所有成功标准满足 |
| `max_loop_iterations_reached` | 达到最大循环次数，防止无限循环 |
| `critical_failure_detected` | 检测到不可恢复的错误 |

---

## 与 Addy Osmani 框架的映射

| Osmani 的概念 | 本系统对应 |
|--------------|-----------|
| Automations (心跳) | LoopController 的调度触发 |
| Worktrees (隔离) | ExecutorAgent 的并行执行隔离 |
| Skills (项目知识) | MemoryAgent 的上下文提供 |
| Plugins/Connectors (工具集成) | ExecutorAgent 的工具调用能力 |
| Sub-agents (maker/checker) | ExecutorAgent + CriticAgent 的分离 |
| 状态/记忆层 | MemoryAgent + TaskResultStore + FeedbackQueue |
| Comprehension debt | MonitorAgent 的可观测性 + 人工审查点 |
| Intent debt | MemoryAgent 的知识外部化 |

---

## 与 Claude Code / Workflow 工具的映射

| 本系统组件 | Claude Code 实现 |
|-----------|-----------------|
| GoalAgent | 用户 prompt → Workflow 的 `args` |
| PlannerAgent | Workflow script 的 `phase()` + `pipeline()` 设计 |
| ExecutorAgent | `agent()` 调用 |
| CriticAgent | adversarial verify 模式——多个 `agent()` 尝试推翻 |
| MemoryAgent | 项目 `memory/` 目录 + CLAUDE.md |
| MonitorAgent | `budget` 机制 + `/workflows` 进度追踪 |
| LoopController | Workflow script 的控制流（while 循环、条件判断） |
| TaskQueue | Workflow 的 `pipeline()` / `parallel()` 调度 |
