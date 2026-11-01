# combo-circuits

## Purpose

组合逻辑电路管理：列表、`@xyflow/react` 画布连线、网表级**纯组合**仿真；内置加法器/编解码/七段与代表性 74LS 模块；可下钻门级 internals。为后续 ALU/通路积木与简易 CPU 提供组合地基。

**溯源**：[`docs/task/step1/task02.md`](../../../docs/task/step1/task02.md)。代码：`src/features/combo-circuits/`。

## Requirements

### Requirement: Inherit platform shell

系统 SHALL 复用 app-shell / 主题 / 三语 / ANSI `GateSymbol` / 门公式求值；首页仍 `/lgc`。

### Requirement: Routes and navigation

系统 SHALL 提供 `/zeda/clc` 与 `/zeda/clc/:id`；侧栏 `nav.comboCircuits`。

### Requirement: Isolated persistence

系统 SHALL 使用独立库 `zeda.combo-circuits`；`ComboCircuit` CRUD / 复制 / 导入导出（`version: 1`）；`normalizeCircuit` 兼容缺省字段；稳定 Snowflake id。权威数据 SHALL 为网表（节点+连线+对外 IO），SHALL NOT 持久化全量电路真值表，SHALL NOT 把整电路塞进 `LogicGate`。

### Requirement: Canvas editing

系统 SHALL 用 `@xyflow/react` 放置逻辑门、内置/种子模块，以及嵌套其它组合电路（`kind: 'circuit'`，环检测）；引脚级连线；undo/redo；保存。builtin 只读 +「复制为自定义」。

> 初稿 task02 曾写「自定义不可再嵌套」；**实现已支持嵌套**，本 spec 以代码为准。

#### Scenario: Nesting cycle

- **WHEN** 嵌套形成环  
- **THEN** 明确报错

### Requirement: Combinational evaluation only

系统 SHALL 对外输入开关 → 拓扑求值 → 输出与连线电平着色；门实例复用阶段一求值；模块按行为或 internals 求值。SHALL NOT 引入时钟或时序波形。SHALL NOT 用本网表内核承担后续时序/CPU 时钟语义。

#### Scenario: Illegal topology

- **WHEN** 组合环、悬空关键输入或同网多驱动  
- **THEN** 明确报错

#### Scenario: Missing gate ref

- **WHEN** 门引用无法解析  
- **THEN** 明确失败，不静默当恒 0

### Requirement: List and detail UX parity

列表：默认分页 10（`zeda.circuits.pageSize`）、卡片、搜索、多选、导入导出、复制；分页贴底。详情：侧栏元信息/组件库 + 画布仿真；模块可下钻门级。

### Requirement: Frozen catalog

系统 SHALL 提供下表种子（名称可 i18n；行为与 IO 语义固定）。教材型加法器/编解码/七段为 **builtin** 只读；74LS 代表以实现约定为 **custom** 可编辑（非整系列）。拓扑以门级 `internals` 落库，列表与下钻共用。

#### Adders

| builtinKey | IO 要点 |
|------------|---------|
| `half_adder` | A,B → Sum, Cout |
| `full_adder` | A,B,Cin → Sum, Cout |

#### Encoders / decoders

| builtinKey | IO 要点 |
|------------|---------|
| `encoder_4_2` | I0–I3 → Y1,Y0（互斥假设须标明） |
| `priority_encoder_8_3` | I0–I7 → Y2–Y0 + 有效/组信号 |
| `decoder_2_4` | A1,A0 → Y0–Y3 |
| `decoder_3_8` | A2–A0 → Y0–Y7 |
| `seven_seg_decoder` | D3–D0 → a–g；**共阴**高电平点亮 |

#### 74LS representatives (not full family)

| builtinKey | 要点 |
|------------|------|
| `74ls138` | 3→8；使能；Y 低有效（UI 标明） |
| `74ls148` | 8→3 优先编码（简化可仿真） |
| `74ls283` | 4 位超前进位加法 |

#### Scenario: Open and drill half_adder

- **WHEN** 打开半加器并下钻  
- **THEN** 可见门级内部且可在顶层仿真

### Requirement: Cross-feature boundary

组合电路 SHALL NOT 嵌套触发器/时序**实体表**；叶子门来自 logic-gates。

### Requirement: i18n domain

系统 SHALL 提供 `circuits` 文案域与 `nav.comboCircuits`，三语同步。

## Open / deferred

须另起 change（服务北星者优先，见 roadmap）：

- **布线优化**：自动分层布局、正交布线、交叉避让、IO 左右锚定、选中高亮与仿真色区分、一键整理（可 undo）  
- **表达式 → 门级网表综合**（高杠杆，通向 ALU）  
- 缩略图、网表导出公式/真值表页、总线/探针、大画布虚拟化、导入版本演进  
- 完整 74 系列、WASM、后端、PCB/模拟 — 默认不做  

## Verification (smoke)

- `pnpm build`
- 侧栏 `/clc`；分页/卡片/搜索；复制 builtin；拖门连线；翻转输入；环路报错；半加/全加/编解码/七段/74ls138·148·283 可开可下钻；导入导出；缺门引用失败；三语；小屏侧栏折叠  
