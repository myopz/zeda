# AGENTS.md

给在本仓库工作的 AI Agent 与人类协作者的强制上下文。行为真相源见 [`openspec/specs/`](./openspec/specs/)；技术说明见 [`docs/`](./docs/)。

## 项目是什么

**zeda**：浏览器内数字逻辑学习/仿真 SPA。纯前端，无后端账号。数据在 IndexedDB；部署到 Cloudflare Workers 静态资源，路径前缀 **`/zeda`**。

**北星**：教学用简易 CPU + 简单汇编程序的装载与运行（可下钻）。路径见 [`docs/roadmap.md`](./docs/roadmap.md)。未经 OpenSpec change，不要把范围膨胀成完整 ISA / 流水线 / SoC。

已交付 capabilities：

1. `app-shell` + `logic-gates` → `/lgc`
2. `combo-circuits` → `/clc`
3. `flip-flops` → `/ff`
4. `sequential-circuits` → `/seq`

首页重定向：`/zeda` → `/zeda/lgc`。不要擅自改默认落地页，除非 change 规格明确要求。

## 动手前必读

1. [`docs/roadmap.md`](./docs/roadmap.md) — 北星与 P5–P9 规划  
2. [`openspec/README.md`](./openspec/README.md) — OpenSpec 流程与 capability 索引  
3. 相关 [`openspec/specs/<capability>/spec.md`](./openspec/specs/)（及进行中的 `openspec/changes/<name>/`）  
4. 需要全文验收细节时查 [`docs/task/`](./docs/task/)  
5. [`docs/architecture.md`](./docs/architecture.md)、[`docs/conventions.md`](./docs/conventions.md)  

`.tmp/`、`.cursor/plans/` 为草稿；阶段全文在 `docs/task/`。**冲突时以代码 + `openspec/specs/` 为准**。

## OpenSpec 工作流（本仓库）

```text
openspec/changes/<change>/proposal.md
  → specs/（delta）→ design.md → tasks.md
  → apply（勾选 tasks）
  → archive + 合并进 openspec/specs/
```

- **进行中变更**写在 `openspec/changes/<change-name>/`，不要只改代码不改 spec  
- **勘误**可直接修正 `openspec/specs/**/spec.md`，但行为变更应走 change  
- Artifact 约定见 `openspec/config.yaml`  

## 硬边界（默认不做）

除非当前 change 的 proposal/specs 明确纳入：

- 不引入后端、账号、云同步、WASM（可规划，不默默开做；WASM 属路线图后期）
- 不实现传输延迟、建立保持检测、竞争冒险专项、多时钟域产品化
- 不做「完整 74LS/4000 系列」；只做规格冻结的代表件
- 不把 CPU/汇编塞进 `sequential-circuits` 单模块膨胀——新开独立 feature
- 不上完整现代 ISA / 流水线冒险全家桶 / SoC，除非单独 change 且服务北星验收
- 不改无关特性的 Dexie schema / 导出 `version` 语义「顺手重构」
- 不静默吞错：非法公式、环路、悬空输入、禁止态、解析失败 → **明确报错或 UI 提示**

## 架构不变量

| 不变量 | 说明 |
|--------|------|
| 特性隔离存储 | 四库分离：`zeda.logic-gates` / `zeda.combo-circuits` / `zeda.flip-flops` / `zeda.sequential-circuits` |
| 权威数据 | 门=公式；组合=网表；触发器/时序=网表 + 模块行为（`step`/方程）。不持久化全量真值表/波形 |
| 仿真分层 | 组合用 `combo-circuits/lib/netlist.ts`；时序用 `flip-flops/lib/seq-sim.ts`（可注入模块解析）。**不要**用 combo 网表当时钟仿真内核 |
| 内置只读 | `kind: 'builtin'` 禁改删；允许「复制为自定义」 |
| 符号 | 逻辑门 ANSI（`GateSymbol`） |
| i18n | 改文案必须同步 `zh-CN` / `en` / `zh-TW` |
| base | Vite `base: '/zeda/'` 与 Router `basename="/zeda"` 必须一致 |

## 特性目录约定

```
features/<name>/
  types.ts
  db/{database,repository,seed}.ts
  lib/
  components/
  pages/
```

- 新路由：同时改 `src/app/router.tsx` 与 `AppSidebar`，并补三语文案  
- 种子变更：bump 对应 `*_LAYOUT_REV` / `GATE_META_REV`  
- 稳定 id：Snowflake `fixed(...)`  
- localStorage：`zeda.<domain>.*`

## 改动原则

- 最小且聚焦；同构 UX；层次复用 FF/Seq 模块  
- Debug-first：禁止伪成功、静默恒 0  
- 验证：`pnpm build` + 对应 spec 场景 / 归档 tasks 冒烟  

## 常用命令

```bash
pnpm install && pnpm dev
pnpm build && pnpm lint
pnpm deploy
```

## 文档维护

- 行为变更 → change → 合并 `openspec/specs/`  
- 北星阶段/待办优先级 → `docs/roadmap.md`  
- 跨特性架构 → `docs/architecture.md`  
- 约定 → 本文与 `docs/conventions.md`  
- README 只保留概览与入口链接  
