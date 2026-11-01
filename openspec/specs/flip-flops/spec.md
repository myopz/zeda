# flip-flops

## Purpose

触发器电路管理：画布设计、理想时钟行为仿真、功能表 / 状态转换图 / 时序图；提供 `ff-modules` 与共享 `seq-sim` 内核，供时序 MSI 与未来 CPU 寄存器堆复用。

**溯源**：[`docs/task/step2/task03.md`](../../../docs/task/step2/task03.md)、`.cursor/plans/触发器电路管理_*.plan.md`。代码：`src/features/flip-flops/`。

## Requirements

### Requirement: Inherit and boundaries

系统 SHALL 复用壳层、门库、`GateSymbol`、xyflow UX、undo/redo。SHALL NOT 用 combo `netlist.ts` 作时序内核。SHALL NOT 修改 `ComboCircuit` schema。首页仍 `/lgc`。

### Requirement: Routes and navigation

系统 SHALL 提供 `/zeda/ff`、`/zeda/ff/:id`；侧栏 `nav.flipFlops`。

### Requirement: Isolated persistence

系统 SHALL 使用 `zeda.flip-flops`；CRUD / 复制 / 导入导出 `version:1`；`normalizeFlipFlop`；稳定 id（如 `fixed(201…210)`）；`FF_LAYOUT_REV` 控制种子重写。权威数据 SHALL 为网表 + 模块行为（方程/`step`）；SHALL NOT 持久化全量功能表或波形。

### Requirement: Canvas and hierarchy

系统 SHALL 支持门与 FF 模块拖放连线；builtin 只读 + 复制为自定义；全部目录种子层次 internals；下钻（中心 ⇅ / 双击）结构只读，下钻时跳过时序仿真；面包屑 / Esc 返回。

### Requirement: Sequential simulation semantics

系统 SHALL 以行为级 FF + 组合云 DAG 求值。

#### Scenario: Level-sensitive

- **WHEN** 门控/锁存使能有效  
- **THEN** 输出随数据透明更新

#### Scenario: Edge-triggered

- **WHEN** 边沿型遇到有效沿（默认上升沿；`74ls112` 元数据为下降沿）  
- **THEN** 仅在该沿按次态函数更新

#### Scenario: Async priority

- **WHEN** 异步 PRE/CLR 有效  
- **THEN** 优先于时钟

#### Scenario: Combinational loop without FF

- **WHEN** 无 FF 隔断的纯门环  
- **THEN** 明确报错

#### Scenario: Forbidden RS state

- **WHEN** 基本 RS 出现 S=R=1  
- **THEN** 明确提示禁止态

### Requirement: T-bar semantics

T′ SHALL 满足 \(Q^{n+1}=\overline{T\oplus Q^n}\)（T=0 翻转，T=1 保持）。

### Requirement: Analysis views

详情 SHALL 提供：懒分页功能表（现态/次态/禁止态）、状态转换图（单模块种子保证；多比特 TTL 可简化）、有限周期理想时序图（波形标 0/1）。分析面板可折叠且不挤占画布固定高度；进入详情默认展开。特性方程只读展示；SHALL NOT 要求方程→网表综合（扩展项）。

### Requirement: Frozen catalog

全部 **10** 颗为 `kind: 'builtin'` 只读（含 74LS）；层次化 internals；叶子基本 RS 用 `behaviorKey`，其余嵌套 `ff` 步进。

#### Textbook

| builtinKey | 时钟 | 要点 | 层次 |
|------------|------|------|------|
| `rs_basic_nor` | 无 | S,R→Q,Qn；S=R=1 禁止 | 2×NOR + behaviorKey |
| `rs_gated` | 电平 EN | S,R,EN | AND + `rs_basic_nor` |
| `jk_gated` | 电平 CLK | J,K,CLK | AND 树 + `rs_basic_nor` |
| `jk_edge` | 上升沿 | async nPRE/nCLR | 2×`jk_gated`+NOT |
| `d_edge` | 上升沿 | D,CLK；async | 2×`rs_gated`+NOT |
| `t_edge` | 上升沿 | \(Q^{n+1}=T\oplus Q^n\) | XOR+`d_edge` |
| `t_bar_edge` | 上升沿 | T′ 互补约定 | XNOR+`d_edge` |

#### 74LS representatives

| builtinKey | 要点 | 层次 |
|------------|------|------|
| `74ls74` | 双 D；每半片 async | 2×`d_edge` |
| `74ls112` | 双 JK；**下降沿** | 2×(NOT+`jk_edge`) |
| `74ls175` | 四 D；公共 CLK/nCLR | 4×`d_edge` |

### Requirement: List UX and i18n

列表同构（`zeda.flipflops.pageSize` 等）；文案域 `flipflops` + `nav.flipFlops` 三语。侧栏折叠记忆 `zeda.flipflops.sideCollapsed`。

### Requirement: Out of scope physics

SHALL NOT：传输延迟、建立保持检测、竞争冒险专项、多时钟域产品化（除非未来单独 change）。

## Open / deferred

- 特性方程 → 网表综合  
- 更完整波形仪（游标/多探针/导出）  
- NAND 型基本 RS；边沿 D/JK 拓扑把 async 脚真正布全；下钻内仿真；双时钟一等公民；`seq-sim`/功能表单测  
- 寄存器/计数器产品化 → 已由 `sequential-circuits` 承接；其余见 roadmap  

## Verification (smoke)

- `pnpm build` / lint  
- `/ff` 列表详情；各 builtin 只读与下钻；74ls74 异步优先；74ls112 下降沿；边沿仅沿上变；禁止态；三图；分析面板折叠；导入导出；三语；确认 `/clc` 无误伤；必要时 bump `FF_LAYOUT_REV`  
