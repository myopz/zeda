# cpu

Zeda-8 教学用简易 CPU：多周期硬布线控制、256×8 理想内存、8×8 寄存器堆；汇编装载、单步/连续运行与观察窗。独立 Dexie `zeda.cpu`；指令语义在 `cpu-runtime`，**不**进入 combo `netlist`。ISA 见 [`docs/isa.md`](../../../docs/isa.md)。

## Requirements

### Requirement: Program library

系统 SHALL 提供 CPU 程序列表与详情路由 `/cpu`、`/cpu/:id`，侧栏 `nav.cpu`，三语同步。

#### Scenario: Open CPU feature

- **WHEN** 用户打开侧栏「简易 CPU」
- **THEN** 进入程序列表；可打开内置示例或新建自定义程序

### Requirement: Builtin examples readonly

内置程序 `kind: 'builtin'` SHALL 禁止改删；允许「复制为自定义」。

#### Scenario: Edit builtin blocked

- **WHEN** 用户打开内置示例
- **THEN** 源码只读；保存不可用；可复制为自定义后编辑

### Requirement: Assembler

系统 SHALL 将 Zeda-8 汇编汇编为 256 字节映像；支持标签、`ORG`、`DB`；错误带行号；未定义助记符/操作数失败可见。教学电路装载额外校验 16 字上限。

#### Scenario: Assemble with line error

- **WHEN** 源码含未知助记符
- **THEN** 显示 `L{n}: …` 错误且不装载半成品

#### Scenario: Assemble demo_add

- **WHEN** 汇编 `LOADI/ADD/STORE/HALT` 示例并装载运行至停机
- **THEN** 目标寄存器与内存地址为期望和

### Requirement: Teaching datapath canvas (16×8)

系统 SHALL 在 `/cpu/:id` 提供电路 Tab，展示教学 CPU 通路（PC/IR/RegFile/ALU/RAM/控制等），并以网表协调的多周期步进推进取指、执行、访存、写回。教学内存 SHALL 为 16×8；装载映像若占用地址 ≥16 SHALL 失败可见。

#### Scenario: Step fetch on canvas

- **WHEN** 用户装载适配 16 字的程序并在电路 Tab 单步
- **THEN** 可见相位推进与 Mem/IR/PC 相关状态变化

#### Scenario: Load exceeds 16 words

- **WHEN** 机器码占用地址超出 `0x0F`
- **THEN** 装载失败并提示，不静默截断

### Requirement: Module drill from datapath

系统 SHALL 允许从 datapath 节点下钻到既有 `alu_8` / `reg_8` / `regfile_8x8` / `ram_16x8` 等模块 internals（只读）。

### Requirement: Multi-cycle runtime

系统 SHALL 以理想周期推进相位 `FETCH0 → FETCH1 → EXEC → (MEM) → (WB)`；`HALT` 进入 `HALTED`；未定义 opcode 显式报错。

#### Scenario: Step observes phase

- **WHEN** 装载后反复单步
- **THEN** 相位、PC、IR、寄存器、标志、内存视图更新；停机后 Step 保持 HALTED

### Requirement: Hardwired control

控制信号表 SHALL 由相位与 opcode 硬布线导出（`lib/control.ts`）；不做微码、不做流水线。

#### Scenario: Branch uses flags

- **WHEN** 执行 `JZ`/`JC`
- **THEN** 仅当对应标志为 1 时装载 PC 为目标地址

### Requirement: Persistence

权威数据为程序元数据 + `source` 文本；不持久化全量运行时波形。导出 JSON `version: 1`。

## Open / deferred

- 画布 256×8 RAM、完整门级控制硬布线强制等价、波形/断点 UI、WASM — 另起 change  
- 流水线 / 中断 / 现代 ISA — 默认不做  

## Verification (smoke)

- `pnpm build`
- `node scripts/smoke-cpu-datapath.mjs`（或 `pnpm dlx vite-node scripts/smoke-cpu-datapath-run.ts`）
- 侧栏 `/cpu`；电路/汇编 Tab；三语；内置三示例（≤16 字）装载 Run→HALT；越界装载失败可见；可下钻 ALU/RAM  
- 回归：`/lgc` `/clc` `/ff` `/seq` 可开  
