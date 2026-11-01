# Design: add-combo-circuits

合并后见 [`openspec/specs/combo-circuits/design.md`](../../../specs/combo-circuits/design.md)。

## 关键冻结（归档摘要）

- 权威 = 网表；库 `zeda.combo-circuits`；导出 `version:1`
- 求值仅 `netlist.ts`（无时钟）；环路/悬空/多驱动/缺门明确报错
- 冻结：半加/全加、编解码、七段、74ls138/148/283（74LS 实现为 custom）
- 初稿禁止自定义嵌套；**实现已支持 `kind:'circuit'`**，以合并后 spec 为准
