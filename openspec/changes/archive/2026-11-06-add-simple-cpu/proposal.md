# Proposal: add-simple-cpu

## Why
北星：独立简易 CPU feature，勿膨胀 sequential-circuits。

## What Changes
- `src/features/cpu/` + Dexie `zeda.cpu` + `/cpu` 侧栏
- 运行时 PC/IR/RegFile/Mem/标志；Reset/Step/Run

## Capabilities
- **New**：`cpu`
- **Modified**：`app-shell`

## Non-Goals
画布级整机下钻强制、流水线
