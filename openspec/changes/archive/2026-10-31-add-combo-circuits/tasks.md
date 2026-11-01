# Tasks: add-combo-circuits

对照 [`docs/task/step1/task02.md`](../../../../docs/task/step1/task02.md)。

## 1. Shell

- [x] 1.1 路由 `/clc`、`/clc/:id` + 侧栏 + `circuits`/`nav.comboCircuits` 三语

## 2. Data

- [x] 2.1 Dexie `zeda.combo-circuits` + repository/normalize/import-export
- [x] 2.2 seed + modules/internals 冻结种子（含 74LS 代表）

## 3. Canvas & sim

- [x] 3.1 CircuitCanvas + ModulePalette + Side/Meta panels
- [x] 3.2 netlist 拓扑校验与求值；连线电平着色
- [x] 3.3 模块下钻 internals；builtin 只读 + 复制为自定义

## 4. Verify

- [x] 4.1 `pnpm build`
- [x] 4.2 冒烟：列表 UX；半加/编解码/七段/74LS；环路报错；导入导出；三语
