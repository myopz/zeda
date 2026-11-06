# Proposal: add-memory-model

## Why
CPU 需要寄存器堆与可教存储模型；小容量模块进 `/seq`，不做独立内存菜单。

## What Changes
- `regfile_8x8`、`ram_16x8`、`rom_16x8`（category memory）
- 理想周期：同步写 / 组合或使能读
- CPU 256×8 运行时内存在 `add-simple-cpu`

## Capabilities
- **Modified**：`sequential-circuits`

## Non-Goals
独立 `/mem` 路由、缓存、延时模型
