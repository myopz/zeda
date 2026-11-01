# logic-gates

## Purpose

管理与仿真单个逻辑门：以布尔**公式**为权威数据，提供列表/详情、ANSI 符号、懒分页真值表与单门交互仿真；并为后续组合/时序提供门叶子与 `bool-engine`。

**溯源**：[`docs/task/step1/task01.md`](../../../docs/task/step1/task01.md)。代码：`src/features/logic-gates/`。

## Requirements

### Requirement: Routes and navigation

系统 SHALL 在 `/zeda/lgc` 提供列表、在 `/zeda/lgc/:id` 提供详情；侧栏可进入逻辑门管理。

### Requirement: Isolated persistence

系统 SHALL 将逻辑门存于 Dexie 库 `zeda.logic-gates`；支持 CRUD、复制、JSON 导入/导出；读入 SHALL 经 `normalizeGate`（兼容旧版全量 `truthTable` 字段）。

#### Scenario: Persist across reload

- **WHEN** 保存自定义门并刷新  
- **THEN** IndexedDB 中仍可读出该门

### Requirement: Formula is source of truth

系统 SHALL 以 `formulas` 为权威行为；SHALL NOT 持久化全量真值表；真值表 SHALL 由公式按页懒生成（默认 10 行/页）。

#### Scenario: Edit formula refreshes table

- **WHEN** 用户修改公式  
- **THEN** 真值表只读刷新，且不隐式改写为「自动简化后的另一公式」

### Requirement: Boolean engine

系统 SHALL 解析并求值 `AND/OR/NOT/XOR/XNOR` 及常见符号写法；非法公式 SHALL 明确报错，不静默吞掉。可保留小规模 Quine–McCluskey 能力仅用于旧数据迁移。

#### Scenario: Invalid formula

- **WHEN** 公式非法  
- **THEN** UI/引擎给出明确错误

### Requirement: List management

列表 SHALL 支持表格/卡片、默认分页 **10**（可选 10/25/50/100，localStorage 记忆）、搜索、多选、新建、删除（非内置）、复制、导入、导出选中/全部；展示符号缩略、类型、引脚数、更新时间；分页条贴底。

#### Scenario: Builtin cannot be deleted

- **WHEN** 目标为 `kind: builtin`  
- **THEN** 删除不可用或被拒绝

### Requirement: Detail editing

详情 SHALL 支持元信息、ANSI 符号预览、输入/输出引脚数量与命名（自定义可改）、多输出公式编辑、本地 undo/redo、保存；内置门只读（不可保存/改引脚/改公式）。重命名输入引脚时 SHALL 同步替换公式中的变量名。

### Requirement: ANSI symbol and single-gate simulation

系统 SHALL 使用美国 ANSI 风格符号；`SimCanvas` SHALL 允许切换输入高低电平并按公式显示输出（单门，无多门连线）。

#### Scenario: Toggle inputs

- **WHEN** 翻转仿真输入  
- **THEN** 输出按当前公式立即更新

### Requirement: Builtin catalog

系统 SHALL 提供内置：AND、OR、NOT、NAND、NOR、XOR、XNOR，以及至少一个自定义示例（AOI）。种子 id SHALL 使用稳定 Snowflake `fixed(...)`；元数据重写由 `GATE_META_REV` 控制。

#### Scenario: Open builtin AND

- **WHEN** 打开内置 AND  
- **THEN** 可查看/仿真，不可保存修改

### Requirement: Design freezes vs draft

相对初稿：base 统一 `/zeda`；列表默认 10 非 25；真值表只读派生；输入数无产品硬上限（靠懒分页保性能）。

## Open / deferred (not current acceptance)

下列不构成本 capability 已交付验收；开做须另起 change（对齐 `docs/roadmap.md`）：

- 公式可选简化（SOP/QM）操作、大输入性能提示、列表记住页码/视图、导入版本演进提示、极多页真值表跳转 UX、复杂 ANSI 版图、bool-engine 单测  
- WASM 加速（平台后期）  
