# Proposal: add-datapath-blocks

## Why
通往 8 位 CPU 需要可复用通路积木（MUX/ALU/比较器）与 8 位寄存器。

## What Changes
- combo：`mux_2_1_8`/`mux_4_1_8`/`demux_1_2_8`/`alu_8`/`cmp_8`（行为 + shell 种子）；`CIRCUIT_LAYOUT_REV=9`
- seq：`reg_8`；`SEQ_LAYOUT_REV` 同步 bump（与 memory change 合并落地）
- i18n 三语 category `datapath`

## Capabilities
- **Modified**：`combo-circuits`、`sequential-circuits`

## Non-Goals
门级 ALU 全展开、总线三态产品化、完整 74 系列、CPU 整机

## Impact
仅扩展模块目录与种子；仿真仍走 evaluate / step。
