# Proposal: add-control-unit

## Why
多周期硬布线控制是教学 CPU 的核心；与 docs/isa.md 对齐。

## What Changes
- `src/features/cpu/lib/control.ts` + 相位机（随 cpu feature 交付）
- FETCH/EXEC/MEM/WB/HALTED

## Capabilities
- **New**（随 cpu）：控制表能力并入 `cpu` spec

## Non-Goals
微码、流水线、FSM 可视化编辑器
