# Design: add-flip-flops

合并后见 [`openspec/specs/flip-flops/design.md`](../../../specs/flip-flops/design.md)。

## 关键冻结（归档摘要）

- 独立库；权威 = 网表 + 模块行为；`FF_LAYOUT_REV`
- 时钟：电平敏感 / 理想边沿（默认↑；74ls112↓）/ 异步优先
- T′：\(Q^{n+1}=\overline{T\oplus Q^n}\)
- 10 颗全 builtin；层次复用；基本 RS 用 `behaviorKey`
- 不做：延时、建立保持、竞争冒险专项、多时钟域
