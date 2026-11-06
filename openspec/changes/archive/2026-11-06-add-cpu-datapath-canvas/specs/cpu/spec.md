## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Assembler

系统 SHALL 继续支持汇编；教学电路装载额外校验 16 字上限。行为级 256 字 runtime 可保留作对照。
