# cpu — design

## Goals

- 教学可验收的 8 位 CPU + 汇编工具链（北星 P7–P9）
- 独立 feature：`src/features/cpu/`，Dexie `zeda.cpu`
- 运行时建在理想多周期模型上；复用 ISA 文档与 combo/seq 积木作教具，非整机门级强制下钻

## Non-Goals

流水线、微码、中断、特权、完整现代 ISA、把指令语义塞进 `netlist.ts`

## Data

| 实体 | 权威 | 库 |
|------|------|-----|
| CpuProgram | name/description/kind/source | `zeda.cpu` / `programs` |

种子：`CPU_LAYOUT_REV`；id `snowflake.fixed(401+)`。

## Runtime stack

```text
assembler.ts  →  Uint8Array(256) + highWater
datapath-sim.ts  ← 教学权威（16×8；协调 alu/regfile/ram 语义 + 多周期相位）
cpu-runtime.ts   ← control.ts（256 字行为对照，可选）
isa.ts / docs/isa.md
datapath-graph.ts + DatapathCanvas（只读通路 + 下钻）
```

## UI

- List：分页/搜索/新建/删除/复制  
- Detail Tabs：**电路**（DatapathCanvas + 控制信号）| **汇编**（编辑器 + 观察窗）  
- 装载校验教学 16 字；可下钻 `alu_8` / `reg_8` / `regfile_8x8` / `ram_16x8`  

## i18n

`nav.cpu` + `cpu.*` 三语。
