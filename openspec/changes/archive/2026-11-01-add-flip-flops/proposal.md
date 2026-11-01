# Proposal: add-flip-flops

## Why

需要触发器级时序教学：理想时钟仿真、功能表/状态图/时序图；并为寄存器/计数器与未来 CPU 提供 FF 目录与 `seq-sim` 内核。

## What Changes

- 新增 `flip-flops`：`/ff`、Dexie `zeda.flip-flops`
- 新建时序求值器 `seq-sim`（不扩展 combo netlist）
- 冻结 RS/JK/D/T/T′ + 74ls74/112/175；层次 internals；三图面板

## Capabilities

- **New**：`flip-flops`
- **Modified**：`app-shell`（侧栏）

## Non-Goals

寄存器/计数器产品封装、方程→网表综合主闭环、延时/建立保持、完整 74 系列、改 combo schema。

## Impact

新建 `src/features/flip-flops/`；后续 sequential 复用内核。

## References

- [`docs/task/step2/task03.md`](../../../../docs/task/step2/task03.md)
- `.cursor/plans/触发器电路管理_*.plan.md`
- 合并后：[`openspec/specs/flip-flops`](../../../specs/flip-flops/)
