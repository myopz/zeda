# Proposal: add-sequential-circuits

## Why

需要寄存器/计数器/代表 74LS 的时序电路管理，层次复用触发器并下钻到门，作为简易 CPU 的 MSI 地基（PC/RegFile/移位等可再封装）。

## What Changes

- 新增 `sequential-circuits`：`/seq`、Dexie `zeda.sequential-circuits`
- 节点：gate / ff / seq / circuit（可嵌套其它 seq）
- 泛化 `seq-sim`（模块解析注入 + 纹波 delta）；保持 `/ff` 无回归
- 冻结寄存器、计数器（含 mod-6）、74ls161/90/194

## Capabilities

- **New**：`sequential-circuits`
- **Modified**：`flip-flops`（共享内核扩展，行为兼容）
- **Modified**：`app-shell`（侧栏）

## Non-Goals

完整 74 系列、任意 N 向导、FSM 编辑器、ALU/处理器（独立后续 change）、改 combo/ff schema。

## Impact

新建 `src/features/sequential-circuits/`；触发器保持独立实体。

## References

- [`docs/task/step2/task04.md`](../../../../docs/task/step2/task04.md)
- `.cursor/plans/时序电路管理_*.plan.md`
- 合并后：[`openspec/specs/sequential-circuits`](../../../specs/sequential-circuits/)
