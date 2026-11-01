# Proposal: add-logic-gates

## Why

需要纯前端数字逻辑平台的第一能力：应用壳 + 逻辑门管理/仿真闭环，作为后续组合、时序与简易 CPU 的门叶子与布尔引擎。

## What Changes

- 落地 Vite/React/TS/Tailwind/shadcn 壳（base `/zeda`、AppShell、主题、三语、CF 静态部署）
- 新增 capability `app-shell`、`logic-gates`
- IndexedDB（Dexie `zeda.logic-gates`）、公式权威、ANSI、单门仿真

## Capabilities

- **New**：`app-shell`、`logic-gates`

## Non-Goals

多门连线、时钟/波形、WASM、后端/云同步。

## Impact

新建 `src/features/logic-gates/` 与壳层；首页 `/lgc`。

## References

- 全文验收：[`docs/task/step1/task01.md`](../../../../docs/task/step1/task01.md)
- 合并后规格：[`openspec/specs/logic-gates`](../../../specs/logic-gates/)、[`app-shell`](../../../specs/app-shell/)
