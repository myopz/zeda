# Spec Delta: logic-gates

## Purpose

管理与仿真单个逻辑门，以公式为权威数据。

## ADDED Requirements

### Requirement: Formula is source of truth

系统 SHALL 以 `formulas` 为权威；SHALL NOT 持久化全量真值表；真值表按页懒生成。

#### Scenario: Truth table derived

- **WHEN** 打开详情真值表  
- **THEN** 由公式求值分页展示

### Requirement: List and detail management

系统 SHALL 提供 `/lgc` 与 `/lgc/:id`：CRUD（builtin 只读）、导入导出、undo/redo、ANSI、单门仿真。

#### Scenario: Invalid formula

- **WHEN** 公式非法  
- **THEN** 明确报错，不静默当恒 0

### Requirement: Builtin catalog

系统 SHALL 提供 AND/OR/NOT/NAND/NOR/XOR/XNOR 与 AOI 示例。
