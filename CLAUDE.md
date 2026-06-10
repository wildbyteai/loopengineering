# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Loop Engineering 是一种 AI Agent 工程哲学：不直接 prompt agent，而是设计一个系统去 prompt agent。这个仓库包含该哲学的文档和一个可运行的 TypeScript 实现（LoopEngineering-Core）。

## 核心概念

在修改任何内容之前，先理解这些概念：

- **规划 → 拆分 → 执行 → 对抗验证 → 聚合 → 监控** 形成闭环
- **对抗验证**是核心区别——不是 review，是尝试推翻（CriticAgent 的 3 视角 2/3 通过机制）
- Agent 之间的依赖关系必须是显式定义的（Task DAG），不能靠隐式推断
- 系统的设计目标是让人的角色从"执行者"变为"架构师"

## 常用命令

```bash
npm install          # 安装依赖
npm test             # 运行 Mock 集成测试
npm run build        # 编译 TypeScript
npm run typecheck    # 类型检查（不输出文件）
npm start -- "目标"  # 使用 Claude API 运行 loop
npm run dev          # watch 模式开发
```

## 代码架构

```
src/
├── core/
│   ├── types.ts     # 所有数据对象类型（Zod schema + TS 接口）
│   ├── store.ts     # 存储抽象（Store 接口 + JsonFileStore）
│   ├── llm.ts       # LLM 抽象（LLMProvider 接口 + Claude/Mock）
│   └── loop.ts      # LoopController 主循环
├── agents/
│   ├── base.ts      # BaseAgent 抽象基类
│   ├── goal.ts      # GoalAgent — 目标标准化
│   ├── planner.ts   # PlannerAgent — 任务规划与拆解
│   ├── executor.ts  # ExecutorAgent — 任务执行
│   ├── critic.ts    # CriticAgent — 3 视角对抗验证
│   ├── memory.ts    # MemoryAgent — 长期记忆
│   └── monitor.ts   # MonitorAgent — 系统监控
├── prompts/
│   ├── goal.ts      # GoalAgent prompt 模板
│   ├── planner.ts   # PlannerAgent prompt 模板
│   ├── executor.ts  # ExecutorAgent prompt 模板
│   └── critic.ts    # CriticAgent prompt 模板（3 个视角）
├── index.ts         # CLI 入口
└── test.ts          # Mock 集成测试
```

## 关键设计决策

1. **Store 是接口**：`JsonFileStore` 是默认实现。后续加 SQLite/远程 DB 只需实现 `Store` 接口
2. **LLMProvider 是接口**：`MockProvider` 用于开发测试，`ClaudeProvider` 用于生产
3. **CriticAgent 多视角**：3 个独立 LLM 调用（correctness/completeness/robustness），2/3 通过才算通过
4. **Prompt 模板独立**：prompt 和 agent 逻辑分离，在 `prompts/` 目录下，便于调优
5. **依赖解析**：TaskQueue 支持 DAG，只有依赖全部 completed 的 task 才会被 Executor 获取

## 开发规范

- 使用 ESM（`type: "module"`）
- 所有文件用 `.js` 扩展名 import（ESM 要求）
- 严格模式 TypeScript
- Prompt 模板放在 `src/prompts/`，agent 逻辑放在 `src/agents/`
- 数据对象用 Zod schema 定义，类型从 schema 推导
- 文档使用中文

## 文档

- [README.md](README.md) — 项目概述和使用说明
- [docs/loop-engineering-core-v1.md](docs/loop-engineering-core-v1.md) — 完整系统规范，包含与 Addy Osmani 框架的映射
