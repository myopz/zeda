# sequential-circuits

## Purpose

时序逻辑电路（寄存器 / 计数器 / **存储器教具** / 代表 74LS）管理：画布设计、层次复用触发器模块、理想时钟仿真与分析视图；下钻至门级或行为壳。触发器 `/ff` 保持独立实体与 schema。为简易 CPU 提供 MSI 与小容量存储教具；**完整 256 字 CPU 内存在 `cpu` feature**。

**溯源**：[`docs/task/step2/task04.md`](../../../docs/task/step2/task04.md)、`.cursor/plans/时序电路管理_*.plan.md`。代码：`src/features/sequential-circuits/`。

## Requirements

### Requirement: Inherit and boundaries

系统 SHALL 复用壳层、门、`ff-modules`、理想时钟语义、xyflow UX。SHALL NOT 用 combo `netlist` 作时序内核。SHALL NOT 修改 `FlipFlopCircuit` / `ComboCircuit` 持久化 schema。首页仍 `/lgc`。

### Requirement: Routes and navigation

系统 SHALL 提供 `/zeda/seq`、`/zeda/seq/:id`；侧栏 `nav.sequential`。

### Requirement: Isolated persistence

系统 SHALL 使用 `zeda.sequential-circuits`；CRUD / 复制 / 导入导出 `version:1`；`normalizeSequential`；稳定 id（如 `fixed(301…311)`）；`SEQ_LAYOUT_REV` 控制重写。权威数据 SHALL 为网表 + 模块行为；SHALL NOT 持久化全量功能表/波形。

### Requirement: Node kinds

网表 SHALL 支持：`gate`、`ff`（FF 目录）、`seq`（本目录）、`circuit`（嵌套其它 `SequentialCircuit`，环检测）。

#### Scenario: Forbidden entity nesting

- **WHEN** 尝试嵌套 FlipFlopCircuit / ComboCircuit 实体  
- **THEN** 不被支持（仅 FF **目录**模块 + 其它 seq 电路）

#### Scenario: Seq nesting cycle

- **WHEN** seq 电路互相嵌套成环  
- **THEN** 明确报错

### Requirement: Shared sequential engine

系统 SHALL 通过可注入模块解析的共享 `seq-sim` 求值（FF + Seq 统一 `step`）；异步纹波：行为模块在 `step` 内算清；扁平多 FF 自定义纹波 SHALL 有限 delta 迭代。

#### Scenario: No regression on flip-flops

- **WHEN** 变更共享内核  
- **THEN** `/ff` 既有种子行为保持（边沿、异步优先、禁止态、组合环报错）

### Requirement: Clock semantics inheritance

SHALL 继承 flip-flops：理想边沿、异步优先。SHALL NOT：传输延迟、建立保持、竞争冒险专项、多时钟域产品化。

### Requirement: Mod-N and up/down policy

冻结种子仅含 **mod-6** 作为 N 进制代表；减法由同步 up/down 覆盖；SHALL NOT 以单独异步减法器种子为验收项。

### Requirement: Canvas, drill-down, analysis

画布：门 / FF / Seq / 其它 seq；undo/redo；builtin 只读 + 复制为自定义。下钻 seq→FF→门，结构只读并跳过仿真。分析：功能/状态表（宽位懒分页或激励子集）、状态图、时序图；面板折叠行为对齐 FF。

### Requirement: Frozen catalog

全部目录种子 `kind: 'builtin'` 只读；层次 internals；仿真权威走目录 `step` 或嵌套 FF 步进。

#### Registers

| builtinKey | 要点 | 层次 |
|------------|------|------|
| `reg_4` | D0–D3,CLK,nLOAD,nCLR → Q0–Q3 | 4×`d_edge`+门 |
| `reg_8` | 8 位并行 load/clear | 行为壳 |
| `shift_reg_4_left` | SI,CLK → Q0–Q3 | `d_edge` 链 |
| `shift_reg_4_right` | 右移镜像 | 同上 |

#### Memory (teaching-scale)

| builtinKey | 要点 |
|------------|------|
| `regfile_8x8` | 双口读 / ↑CLK&WE 写；WA/RA/RB |
| `ram_16x8` | 同步写（↑CLK&nWE=0）；nOE 读 |
| `rom_16x8` | 教学固定查表（非可编程）；`ROM[i]=(i<<4)\|(~i&0xF)` |

#### Counters

| builtinKey | 要点 |
|------------|------|
| `counter_bin_sync_4` | 4 位同步二进制加 |
| `counter_bin_async_4` | 4 位异步（纹波）加 |
| `counter_bin_sync_updown_4` | 4 位同步加/减 |
| `counter_dec_sync` / `counter_dec_async` | 同步/异步十进制 0–9 |
| `counter_mod6_sync` | 同步模 6 |

#### 74LS representatives

| builtinKey | 要点 |
|------------|------|
| `74ls161` | nCLR/nLOAD/ENP/ENT/RCO 等 |
| `74ls90` | 十进制异步结构代表（教学简化） |
| `74ls194` | S0/S1：保持/右/左/并行加载 |

#### Scenario: 74ls161 load and RCO

- **WHEN** 按约定操作加载与使能  
- **THEN** 并行加载与 RCO 可仿真观察

### Requirement: List UX and i18n

同构列表（`zeda.sequential.pageSize` 等）；文案域 `sequential`；侧栏折叠 `zeda.sequential.sideCollapsed`。

## Open / deferred

- 任意模 N 向导、FSM 专用编辑器、完整 74 系列、下钻内仿真、波形仪增强、单测
- 256×8 RAM 画布教具（CPU 侧已有运行时内存）— 按需另起 change

## Verification (smoke)

- `pnpm build` / lint
- `/seq`；各 builtin 只读与下钻；`reg_8`/regfile/ram_16x8/rom_16x8；同步进位；异步纹波；mod-6/十进制回绕；移位；74ls161/90/194；嵌套另一 seq；导入导出；三语；**`/ff` 无回归**；`SEQ_LAYOUT_REV`
