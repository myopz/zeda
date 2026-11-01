# Design: add-sequential-circuits

合并后见 [`openspec/specs/sequential-circuits/design.md`](../../../specs/sequential-circuits/design.md)。

## 关键冻结（归档摘要）

- 独立库与实体；权威 = 网表 + `step`；`SEQ_LAYOUT_REV`；fixed(301…)
- 共享 seq-sim + delta 纹波；仅引用 FF 目录模块
- 可嵌套其它 SequentialCircuit（环检测）
- 模 6 代表；减法 = 同步 up/down
- 下钻 seq→FF→门；分析三图对齐 FF
