# Loop Engineering

> 你不再直接 prompt agent，而是设计一个系统，让这个系统去 prompt agent。

Loop Engineering 是一种 AI Agent 工程哲学。它的核心思想是：**把人从 prompt 的执行者变成 prompt 系统的架构师。**

## 安装

### 作为 Claude Code 插件安装（推荐）

```bash
# 方式 1：直接安装到 Claude Code
/plugin install loopengineering

# 方式 2：手动链接
git clone https://github.com/your-username/loopengineering.git
cd loopengineering
npm install
ln -s $(pwd) ~/.claude/plugins/loopengineering
```

安装后，在 Claude Code 中输入 `/loop` 即可启动 loop。

### 作为独立工具使用

```bash
git clone https://github.com/your-username/loopengineering.git
cd loopengineering
npm install

# Mock 测试（无需 API key）
npm test

# 真实运行
export ANTHROPIC_API_KEY=your-key
npm start -- "构建一个带认证的 REST API"
```

## 使用方式

### `/loop` — Claude Code 内置 skill

在 Claude Code 中直接使用：

```
/loop 构建一个带用户认证和 CRUD 的 REST API
/loop 重构 auth 模块，添加单元测试
/loop 分析这段代码的性能瓶颈并给出优化方案
```

`/loop` 会自动：
1. 标准化你的目标
2. 拆解为可验证的子任务
3. 逐个执行
4. **3 视角对抗验证**（correctness / completeness / robustness）
5. 记忆沉淀 + 监控报告

### `/loop-run` — TypeScript 运行时

如果你需要完整的持久化存储和监控：

```
/loop-run 构建一个 CLI 工具
```

这会调用 TypeScript 实现，支持 JSON 文件持久化、跨会话记忆。

## 为什么需要 Loop Engineering

当你直接和 Agent 对话时，你是一个"手艺人"——每次都要亲力亲为地组织指令、检查输出、修补错误。这在简单任务上没问题，但面对复杂工程任务时，人的注意力和上下文窗口都成了瓶颈。

Loop Engineering 的解法是：**把你脑子里的工程判断编码成一个系统**。这个系统负责规划、拆分、执行、验证、聚合和监控，而你只需要设计和调优这个系统本身。

## 核心循环

```
规划 (Plan)
  → 拆分 (Decompose)
    → 执行 (Execute)        ← 多个 Agent 并行
      → 对抗验证 (Adversarial Verify)  ← 独立 Agent 质疑
        → 聚合 (Synthesize)
          → 监控 (Monitor)
            → 反馈 (Feedback)
              → 回到规划
```

### 对抗验证 — 核心区别

**这是 Loop Engineering 和普通 multi-agent 编排的核心区别。** 不是让一个 Agent 检查另一个 Agent 的输出（那只是 review），而是让专门的 Agent **尝试推翻**已有结论。

CriticAgent 用 3 个独立视角评估：
- **Correctness**: 结果是否正确？
- **Completeness**: 结果是否完整？
- **Robustness**: 结果是否健壮？

2/3 通过才算通过。**默认拒绝不确定的结果。**

## 架构

```
┌──────────────────────────────────────────────┐
│              LoopController                   │
│         (闭环调度 · 终止条件判断)               │
└──────────┬──────────────────────────┬────────┘
           │                          │
           ▼                          ▼
┌──────────────────┐        ┌──────────────────┐
│  MonitorAgent    │        │    GoalAgent     │
│  (系统监控)       │        │  (目标标准化)     │
└──────────────────┘        └────────┬─────────┘
                                     │
                            ┌────────▼─────────┐
                            │   PlannerAgent   │
                      ┌────▶│   (规划与拆解)    │
                      │     └────────┬─────────┘
                      │              │
                      │     ┌────────▼─────────┐
                      │     │  ExecutorAgent   │
                      │     │   (任务执行)      │
                      │     └────────┬─────────┘
                      │              │
                      │     ┌────────▼─────────┐
                      │     │   CriticAgent    │
                      │     │  (对抗验证)       │
                      │     │  3视角·2/3通过    │
                      │     └────────┬─────────┘
                      │              │
                      │     ┌────────▼─────────┐
                      └─────│   MemoryAgent    │
                            │  (记忆与沉淀)     │
                            └──────────────────┘
```

## 文件结构

```
loopengineering/
├── .claude-plugin/
│   └── plugin.json        # 插件元数据
├── skills/
│   ├── loop/
│   │   └── SKILL.md       # /loop — Claude Code 内置 skill
│   └── loop-run/
│       └── SKILL.md       # /loop-run — TypeScript 运行时
├── src/
│   ├── core/
│   │   ├── types.ts       # 数据对象类型
│   │   ├── store.ts       # 存储抽象（可替换）
│   │   ├── llm.ts         # LLM 抽象（可替换）
│   │   └── loop.ts        # LoopController
│   ├── agents/
│   │   ├── base.ts        # Agent 基类
│   │   ├── goal.ts        # 目标标准化
│   │   ├── planner.ts     # 任务规划
│   │   ├── executor.ts    # 任务执行
│   │   ├── critic.ts      # 对抗验证（3 视角）
│   │   ├── memory.ts      # 长期记忆
│   │   └── monitor.ts     # 系统监控
│   ├── prompts/           # Prompt 模板
│   ├── index.ts           # CLI 入口
│   └── test.ts            # 集成测试
└── docs/
    └── loop-engineering-core-v1.md
```

## 相关概念

- **Agent Harness**: 对 Agent 的约束和引导结构
- **Ultracode**: Claude Code 中的 multi-agent 编排模式
- **Adversarial Verification**: 用对抗而非协作的方式验证输出质量
- **Intent Debt**: 未外部化的意图在每次 agent 会话中都要重新付出代价

## 文档

- [Loop Engineering Core v1.0 系统规范](docs/loop-engineering-core-v1.md) — 完整设计文档
