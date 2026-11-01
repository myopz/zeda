# Proposal: add-combo-circuits

## Why

在逻辑门之上需要多器件组合电路的设计与纯组合仿真，以及教材型加法器/编解码与少量 74LS 代表件，为后续 ALU/通路积木铺路。

## What Changes

- 新增 capability `combo-circuits`：路由 `/clc`、Dexie `zeda.combo-circuits`
- `@xyflow/react` 画布；`netlist` 求值；冻结种子 + 下钻
- 侧栏增加组合电路入口

## Capabilities

- **New**：`combo-circuits`
- **Modified**：`app-shell`（侧栏）

## Non-Goals

时钟/波形、完整 74 系列、WASM、后端；布线优化与表达式综合列为后续扩展。

## Impact

新建 `src/features/combo-circuits/`；复用门库与 bool-engine。

## References

- [`docs/task/step1/task02.md`](../../../../docs/task/step1/task02.md)
- 合并后：[`openspec/specs/combo-circuits`](../../../specs/combo-circuits/)
