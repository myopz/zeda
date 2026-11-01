# Design: add-logic-gates

合并后权威设计见：

- [`openspec/specs/app-shell/design.md`](../../../specs/app-shell/design.md)
- [`openspec/specs/logic-gates/design.md`](../../../specs/logic-gates/design.md)

## 关键冻结（归档摘要）

- 权威数据 = `formulas`；真值表懒分页只读派生  
- 库名 `zeda.logic-gates`；Snowflake fixed id；`GATE_META_REV`  
- 内置 7 门 + AOI；base `/zeda`；列表默认 pageSize 10  
