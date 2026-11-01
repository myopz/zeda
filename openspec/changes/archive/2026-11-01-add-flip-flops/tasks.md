# Tasks: add-flip-flops

对照 [`docs/task/step2/task03.md`](../../../../docs/task/step2/task03.md) 与触发器计划。

## 1. Shell & data

- [x] 1.1 路由/侧栏/`flipflops` 三语
- [x] 1.2 Dexie + seed（教材 + 74LS）+ repository；`FF_LAYOUT_REV`

## 2. Sim & analysis

- [x] 2.1 `ff-modules` + `seq-sim`（边沿/电平/异步/禁止态/组合环）
- [x] 2.2 func-table / state-diagram / TimingDiagram
- [x] 2.3 internals 层次下钻（只读）

## 3. UI

- [x] 3.1 List/Detail + Canvas + 分析面板折叠行为
- [x] 3.2 激励 drive（VCC/GND/CLK）与波形标注 0/1

## 4. Verify

- [x] 4.1 `pnpm build` / lint
- [x] 4.2 冒烟：各 builtin、74ls74 异步优先、74ls112 下降沿、三图、导入导出、三语
