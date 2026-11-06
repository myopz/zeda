# Proposal: add-cpu-datapath-canvas

## Why

现有 `/cpu` 仅有汇编 + 行为级观察窗，无法看到取指/执行/写回的电路通路。教学需要网表驱动的可视 CPU（先 16×8 内存）。

## What Changes

- `/cpu` Detail 增加 **电路 / 汇编** Tab
- 教学 datapath：PC、IR、RegFile、ALU、`ram_16x8`、MUX、控制互联；周期步进推进
- 地址空间教学模式：`0x00`–`0x0F`；装载越界明确失败
- 可下钻到既有模块；`cpu-runtime` 保留作对照

## Capabilities

- **Modified**：`cpu`
- **Modified**（文档）：`docs/isa.md` 教学 16 字模式

## Non-Goals

画布 `ram_256`、流水线、指令语义进入 combo `netlist`

## Impact

`src/features/cpu/` 新增 datapath 仿真与画布；示例程序适配 16 字。
