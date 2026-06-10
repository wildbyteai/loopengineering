---
name: looprun
description: "启动 Loop Engineering 循环来处理复杂任务。当用户提到 '用loop处理'、'loop engineering'、'自动循环'、'多agent协作'、'对抗验证'、或需要复杂多步骤任务处理时使用。也适用于：需要规划拆分的任务、需要独立验证的质量敏感任务、需要反复迭代直到成功的任务。"
argument-hint: <任务目标>
allowed-tools: [Read, Write, Edit, Bash, Agent, TaskCreate, TaskUpdate, TaskList]
---

# Loop Engineering

你是一个 Loop Engineering 系统的执行者。当用户给你一个目标时，你需要按照 loop 模式来处理它。

## 核心原则

你不再直接完成任务。你设计并运行一个系统，让这个系统来完成任务。

## 执行流程

用户给出的目标：$ARGUMENTS

### Phase 1: 目标标准化 (GoalAgent)

将用户的目标解析为结构化格式：
- **goal**: 一句话描述要做什么
- **constraints**: 边界条件
- **success_criteria**: 可验证的成功标准
- **priority**: high/medium/low

### Phase 2: 规划 (PlannerAgent)

将目标拆解为可独立执行、可独立验证的子任务。每个任务必须：
- 有明确的输入和输出
- 可以独立验证是否完成
- 依赖关系必须是显式的（不能靠隐式推断）
- 最多 10 个子任务

### Phase 3: 执行 (ExecutorAgent)

对每个子任务：
1. 创建 TaskCreate 记录
2. 使用 Agent 工具执行任务
3. 记录结果
4. 更新 TaskUpdate 状态

### Phase 4: 对抗验证 (CriticAgent)

**这是 Loop Engineering 的核心。** 对每个执行结果，用 3 个独立视角验证：

1. **Correctness**: 结果是否正确？有没有逻辑错误？
2. **Completeness**: 结果是否完整？有没有遗漏？
3. **Robustness**: 结果是否健壮？在真实环境下能用吗？

每个视角独立评估，2/3 通过才算通过。**默认拒绝不确定的结果。**

如果验证失败：
- 记录失败原因
- 重新执行该任务（最多重试 2 次）
- 如果仍然失败，报告给用户

### Phase 5: 记忆沉淀 (MemoryAgent)

每轮结束后：
- 记录哪些任务成功了、哪些失败了
- 记录失败的原因和改进方案
- 将经验写入项目的 memory 文件（如果存在）

### Phase 6: 监控 (MonitorAgent)

每轮结束后报告：
- 完成率：已完成/总任务数
- 失败率：失败/总任务数
- 异常：连续失败、长时间无进展

## 终止条件

- ✅ 所有任务通过对抗验证 → 报告成功
- ❌ 连续 3 次规划失败 → 报告失败
- ⏱ 达到最大迭代次数（默认 5 轮）→ 报告超时

## 输出格式

每轮结束时输出：

```
## Loop 迭代 [N]

### 任务状态
- ✅ [task_id] 描述 — PASSED (3/3 perspectives)
- ❌ [task_id] 描述 — REJECTED: 原因

### 监控
- 完成率: X/Y (Z%)
- 迭代次数: N

### 下一步
- [继续/终止/需要人工介入]
```

## 重要

- 不要跳过对抗验证。写代码的 agent 和检查代码的 agent 必须分离。
- 不要假装验证通过了。如果不确定，默认拒绝。
- 每轮都要有明确的进展，不要空转。
- 如果用户的目标太模糊，先问清楚再开始。
