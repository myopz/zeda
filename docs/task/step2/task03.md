# zeda 第三阶段任务开发 — 触发器电路管理

## 背景

zeda 是数字逻辑电路学习/仿真平台：从逻辑门起步，逐步扩展到组合逻辑、时序逻辑、封装元器件，最终可在线上实现可执行指令的处理器。

第一阶段、第二阶段已完成详见 [task01.md](../step1/task01.md)、[task02.md](../step1/task02.md)。

第三阶段（step2 第一步）目标：完成「触发器电路管理」闭环——列表管理、画布连线设计、理想时钟时序仿真，并展示逻辑功能表、状态转换图与时序图；内置教材型触发器与代表性 74LS 触发器。

## 原始要求（验收基准）

继承阶段一/二不变项：

1. 技术栈：`pnpm` + Vite + React + TypeScript + Tailwind CSS + shadcn/ui，纯前端
2. 存储：浏览器 IndexedDB（Dexie）
3. 性能热点后续可用 Rust + WASM（本阶段不做）
4. AppShell：顶栏、底栏、左侧栏可折叠；适配不同屏幕
5. URL base：`/zeda`
6. 可切换主题（亮/暗）与语言（简体中文 / 英文 / 繁体中文）
7. 逻辑门符号继续用美国 ANSI 标准（画布上门实例复用阶段一 `GateSymbol`）

本阶段新增：

8. 触发器电路的管理与画布连线设计（门 + 触发器模块互连）
9. 内置教材型触发器：RS（基本/同步）、JK（同步/边沿）、D、T、T′
10. 自定义触发器电路；内置少量代表性 74LS 系列触发器供引用与学习
11. 理想时钟时序仿真（电平敏感锁存 + 边沿触发 + 异步置位/清零）；功能表 / 状态转换图 / 时序图

### 触发器管理设计要点

| # | 要求 |
|---|------|
| 1 | 管理页 URL：`/zeda/ff`；详情：`/zeda/ff/:id` |
| 2 | 左侧栏新增「触发器」入口进入管理页 |
| 3 | 列表默认分页（默认 **10**）；`page_size` 可选 10 / 25 / 50 / 100；可切换卡片视图；搜索 |
| 4 | 增删改查、导入/导出、复制；内置教材触发器 + 用户自定义画布电路 |
| 5 | 点行/卡片进详情，独立 URL |
| 6 | 详情为图编辑器：放置门/触发器模块、引脚连线、元信息编辑；修改可 undo/redo |
| 7 | 内置电路只读，仅可查看与仿真；可复制为自定义后编辑 |
| 8 | 画布上时序仿真：切换对外输入电平、时钟推进；显示输出与连线电平；详情展示功能表、状态转换图、时序图 |

---

## 承接自阶段一/二（复用，不重做）

- [x] Vite `base: '/zeda/'`，Router `basename="/zeda"`，AppShell / 主题 / i18n
- [x] `LogicGate` 模型、仓储、种子门；`bool-engine` 公式求值
- [x] `GateSymbol` ANSI SVG
- [x] 组合电路列表/详情 UX 模式（分页、卡片、多选、导入导出、删除确认、侧栏折叠）
- [x] `@xyflow/react` 画布模式；`useHistoryState` / undo-redo；Snowflake id
- [x] Cloudflare Workers 静态部署配置（新 chunk 自动纳入 `/zeda/`）

**不复用为仿真内核**：组合电路 `netlist.ts`（禁环路、无状态、无时钟）。本阶段新建时序求值器。

首页重定向保持 `/zeda` → `/zeda/lgc`（不改阶段一默认落地页）。

---

## 本阶段交付清单

### 路由与导航

- [x] `/zeda/ff` 触发器电路列表
- [x] `/zeda/ff/:id` 触发器电路详情（设计 + 仿真 + 三图）
- [x] 侧栏增加「触发器」→ `/ff`（i18n：`nav.flipFlops`）
- [x] 路由表在现有 `/lgc`、`/clc` 旁并列注册；未知路径仍回退到既有默认

### 数据与仓储（Dexie / IndexedDB）

- [x] 独立库：`zeda.flip-flops`（与 `zeda.logic-gates` / `zeda.combo-circuits` 分离）
- [x] `FlipFlopCircuit` 模型持久化；CRUD、复制、JSON 导入/导出（`version: 1`）
- [x] 种子数据：教材型触发器 + 代表性 74LS（见下方冻结清单）；`FF_LAYOUT_REV` 控制重写
- [x] 读入时 `normalizeFlipFlop` 兼容缺省字段；稳定 Snowflake id（`fixed(201…210)`）
- [x] **权威数据为网表 + 模块行为（特性方程/次态函数）**；不持久化全量功能表或波形采样

### 数据模型要点

```ts
// 示意；实现时可微调字段名，但语义需对齐
type CircuitPin = { id: string; name: string }

type FfNode =
  | {
      id: string
      kind: 'gate'
      ref: { builtinKey?: string; gateId?: string }
      position: { x: number; y: number }
    }
  | {
      id: string
      kind: 'ff'
      /** 内置触发器模块，如 d_edge / 74ls74 */
      moduleKey: string
      position: { x: number; y: number }
    }

type CircuitWire = {
  id: string
  from: { nodeId: 'io' | string; pinId: string }
  to: { nodeId: 'io' | string; pinId: string }
}

type FlipFlopCircuit = {
  id: string
  name: string
  description?: string
  kind: 'builtin' | 'custom'
  builtinKey?: string
  /** 纯门交叉耦合锁存时的行为模型键（如 rs_basic_nor） */
  behaviorKey?: string
  group: string
  inputs: CircuitPin[]
  outputs: CircuitPin[]
  nodes: FfNode[]
  wires: CircuitWire[]
  createdAt: number
  updatedAt: number
}
```

约束：

- 叶子只能是阶段一门实例，或本阶段内置触发器模块
- **自定义电路不可再作为节点嵌套进另一自定义电路**（层级封装归后续阶段）
- 门引用解析失败须明确报错，不静默当成恒 0
- **禁止纯门反馈成环**（无 FF 模块隔断的环路 → 明确错误）；基本 RS 用 `behaviorKey` 行为模型仿真，拓扑用门级网表展示
- 复合触发器种子以 **嵌套 `ff` 节点**复用下层模块（层次化），仿真走嵌套模块步进，而非整片 `behaviorKey`

### 画布编辑器

- [x] 复用 `@xyflow/react` 作为节点/边图编辑底座
- [x] 从逻辑门库与内置触发器面板拖入实例
- [x] 引脚级连线；选中、删除节点/边；画布平移缩放
- [x] 自定义电路可编辑元信息（名称、描述、对外 IO 命名、分组）
- [x] 本地 undo / redo；「保存」写入 IndexedDB
- [x] 内置电路：屏蔽保存/改拓扑/改 IO，仅可查看与仿真；提供「复制为自定义」
- [x] 模块下钻：画布组件中心 ⇅ / 双击进入内部网表；面包屑 /「返回上层」/ Esc；下钻时跳过时序仿真（结构只读）

### 时序仿真

- [x] 行为级 FF + 组合云 DAG：组合子图拓扑排序求值；FF 按时钟/电平模型更新状态
- [x] **锁存/门控**：电平敏感（EN/CLK=1 透明）
- [x] **边沿型**：理想瞬时上升沿；`74ls112` 为下降沿（模块元数据 `negedge`）
- [x] **异步 PRE/CLR**：优先于时钟（74LS / 边沿 D·JK 手册简化行为）
- [x] 非法拓扑（组合环、多驱动、悬空关键输入）、禁止态（如基本 RS 的 S=R=1）明确提示，不静默吞掉
- [x] 不做：传输延迟、建立保持检测、竞争冒险专项、多时钟域

### 功能表 / 状态转换图 / 时序图

- [x] **逻辑功能表**：由行为模型按页懒生成（默认 10/页）；含现态/次态；禁止态显式
- [x] **状态转换图**：对单模块种子展示（只读 SVG）；多比特 TTL 简化为半片/主 Q 激励
- [x] **时序图**：理想时钟 + 输入激励 → 输出波形；有限采样窗口；波形标注 0/1
- [x] 分析面板可折叠（展开向下，不挤占画布固定高度）；进入详情默认展开，不持久化折叠态

### 列表页（`/ff`）

- [x] 表格 / 卡片视图切换
- [x] 分页：默认 **10** 条/页，可选 10 / 25 / 50 / 100（`zeda.flipflops.pageSize` 记忆）
- [x] 搜索；多选；新建、删除（非内置）、复制、导入、导出选中/全部
- [x] 展示类型（内置/自定义）、IO 数、节点数、更新时间；分类标签
- [x] 分页条贴底布局（对齐逻辑门 / 组合电路列表体验）

### 详情页（`/ff/:id`）

- [x] 左侧侧栏（基本信息 / 组件库 Tab）+ 画布主区；侧栏折叠记忆 `zeda.flipflops.sideCollapsed`
- [x] 组件面板：逻辑门 + 触发器模块（分类折叠）
- [x] 仿真：点击输入翻转电平；边沿型随 CLK 边沿更新；时序 Tab 可跑有限周期波形
- [x] 详情附加面板：功能表、状态转换图、时序图（下钻时隐藏）
- [x] 内置只读策略与组合电路详情一致；全部目录种子可下钻看层次内部
- [x] 特性方程只读展示（模块元数据）；**不要求**方程综合出网表

### i18n

- [x] 新增 `flipflops` 文案域与 `nav.flipFlops`；`zh-CN` / `en` / `zh-TW` 三语同步

---

## 内置触发器目录（冻结清单）

种子必须覆盖下列条目；名称可本地化，行为与 IO 语义固定。

实现约定（相对初稿有调整）：

- **全部 10 颗均为 `kind: 'builtin'` 只读**（含 74LS）；可「复制为自定义」后编辑
- 拓扑均为 **层次化 internals**（`GATE_LEVEL_FF_KEYS` = 全目录）；不再用黑盒单节点种子
- 仿真：叶子基本 RS 靠 `behaviorKey`；其余靠嵌套 `ff` 模块步进
- `CUSTOM_SEED_KEYS` 为空；`FF_LAYOUT_REV`  bump 后重写种子拓扑

### 教材型触发器（builtin）

| builtinKey | 名称 | 时钟模型 | IO / 行为要点 | 层次复用 |
|------------|------|----------|----------------|----------|
| `rs_basic_nor` | 基本 RS（NOR） | 无 CLK；交叉耦合锁存 | 入 S,R；出 Q,Qn；S=R=1 禁止态 | 叶子：2× NOR；整片 `behaviorKey` |
| `rs_gated` | 同步（门控）RS | 电平敏感 EN | 入 S,R,EN；出 Q,Qn | AND + `rs_basic_nor` |
| `jk_gated` | 同步 JK | 电平敏感 CLK | 入 J,K,CLK；出 Q,Qn | AND 树 + `rs_basic_nor` |
| `jk_edge` | 边沿 JK | 理想上升沿 | 入 J,K,CLK；async nPRE/nCLR；出 Q,Qn | 主从：2× `jk_gated` + NOT |
| `d_edge` | D 触发器 | 理想上升沿 | 入 D,CLK；async nPRE/nCLR；出 Q,Qn | 主从：2× `rs_gated` + NOT |
| `t_edge` | T 触发器 | 理想上升沿 | 入 T,CLK；\(Q^{n+1}=T\oplus Q^n\) | XOR + `d_edge` |
| `t_bar_edge` | T′ 触发器 | 理想上升沿 | 入 T,CLK；\(Q^{n+1}=\overline{T\oplus Q^n}\)（T=0 翻转，T=1 保持） | XNOR + `d_edge` |

### 74LS 代表触发器（builtin 复合件，非整系列）

| builtinKey | 器件 | IO / 行为要点 | 层次复用 |
|------------|------|----------------|----------|
| `74ls74` | 双 D | 上升沿 + 每半片独立 async nPRE/nCLR | 2× `d_edge` |
| `74ls112` | 双 JK | **下降沿** + 每半片 async；选 112 避免与 76 主从混淆 | 2×（NOT + `jk_edge`） |
| `74ls175` | 四 D | 公共 CLK + 公共 nCLR；为后续寄存器铺垫 | 4× `d_edge` |

自定义电路：用户可在画布上用阶段一门 + 上述触发器模块搭接（仍不可嵌套其他自定义时序电路）。

---

## 相对初稿的设计落地约定

| 初稿设想 | 本阶段约定 / 实现现状 |
|----------|----------------------|
| step2 触发器管理/设计/仿真 | `/ff` 列表+详情闭环 + 时钟感知行为仿真 |
| RS/JK/D/T/T′ | 上表冻结种子；T′ 语义写死为与 T 互补 |
| 自定义 74LS 常用触发器 | **3** 颗：74 / 112 / 175；现为 **builtin 复合**（非 custom 种子） |
| 画布拖动设计 | xyflow；叶子=门+FF 模块；**独立实体**，不改 `ComboCircuit` |
| 特性方程辅助生成 | **扩展优化**；主闭环只读展示方程 |
| 功能表/状态图/时序图 | 功能表懒分页；状态图对单模块种子；时序图有限周期理想波形 |
| 与组合电路关系 | 不复用 `ComboCircuit` / combo `netlist`；可复用门与画布 UX |
| 门级 / 下钻 | 全目录层次 internals；下钻结构只读，时序仍由行为/嵌套模块求值 |

---

## 已完成的闭环后增强

> 相对 MVP 文档的后续迭代，已落地，计入本阶段交付。

- [x] 教材型与 74LS **层次化复用**（边沿 JK←门控 JK；D←门控 RS；T/T′←边沿 D；74LS←边沿 D/JK）
- [x] 画布下钻图标居中（与组合电路 ⇅ 一致）；面包屑返回
- [x] 分析区折叠：向下收起，画布高度不收缩；进入页面默认展开
- [x] 时序波形更清晰标注 0/1；去掉冗余「运行波形」类干扰入口（以面板内步进/激励为准）

---

## 扩展优化（本阶段闭环后的增强项）

> 下列项**不纳入**本阶段原始验收必须。

### 根据特性方程生成电路

- [ ] 输入特性方程 / 激励表 → 自动生成可仿真门级或 FF 模块网表
- [ ] 布局落地与非法式明确报错
- [ ] 入口：详情页「由方程生成」对话框

### 其它近期待增强

- [ ] 更完整波形工具（游标、多路探针、导出）
- [ ] 寄存器 / 计数器 / 移位寄存器封装模块
- [ ] 建立保持时间违规提示（教学用简化模型）
- [ ] 电路缩略图；导入版本演进说明
- [ ] NAND 型基本 RS 作为对称种子
- [ ] 边沿 D/JK 门级图中把 nPRE/nCLR 真正布进拓扑（现行为脚存在，示意拓扑未全接线）
- [ ] 下钻视图内可仿真（现为结构只读）
- [ ] 双时钟器件去掉 `__clk2` 状态 hack，改为一等公民多时钟
- [ ] `seq-sim` / 功能表自动化单测

---

## 明确不做 / 后续阶段

### 本阶段明确不做

- [ ] 特性方程 → 网表综合（主闭环）
- [ ] 寄存器/计数器/移位/ALU 级模块产品化
- [ ] 自定义时序电路再封装嵌套
- [ ] 完整 74LS / 4000 系列器件库
- [ ] 传输延迟、竞争冒险自动分析、多时钟域
- [ ] 修改 `combo-circuits` schema / 把 FF 塞进组合网表
- [ ] Rust + WASM 加速
- [ ] 后端 / 账号 / 云端同步
- [ ] PCB / 物理封装；模拟电路
- [ ] 除简中 / 英 / 繁中以外的语言包

### 平台级后续阶段（路线图）

- [ ] 时序子系统（寄存器、计数器、有限状态机）
- [ ] 封装元器件与层级模块
- [ ] WASM 加速布尔/仿真热点
- [ ] 可执行指令的处理器实验链路

---

## 关键路径速查

```
src/app/router.tsx                 # 注册 /ff、/ff/:id
src/components/layout/AppSidebar.tsx
src/features/logic-gates/          # 复用：门库、bool-engine、GateSymbol
src/features/flip-flops/
  types.ts                         # FlipFlopCircuit / Node / Wire / behaviorKey
  db/                              # Dexie、seed（FF_LAYOUT_REV）、repository
  lib/
    ff-modules.ts                  # 触发器目录、引脚、次态、方程
    seq-sim.ts                     # 时序求值、拓扑校验、嵌套模块
    func-table.ts                  # 功能表懒分页
    state-diagram.ts               # 状态图数据
    internals.ts                   # 层次化门级/模块 internals + 下钻
    groups.ts                      # 分组约定
  components/
    FfCircuitCanvas.tsx            # 画布 + 下钻
    canvasNodes.tsx                # IO / 器件节点（中心 ⇅）
    FfModulePalette.tsx
    FfSidePanel.tsx
    FfMetaPanel.tsx
    FuncTablePanel.tsx
    StateDiagramView.tsx
    TimingDiagram.tsx
  pages/
    FlipFlopListPage.tsx
    FlipFlopDetailPage.tsx
src/components/ui/timing-wave.tsx  # 共用波形（若抽离）
src/i18n/locales/                  # flipflops + nav.flipFlops
```

## 验证建议

### 主闭环（已具备）

- `pnpm build` / 类型检查通过
- 冒烟：
  - 侧栏可进 `/ff`；主题与三语下关键文案正常
  - 列表分页 / 卡片 / 搜索；新建自定义；删除非内置；复制内置为可编辑副本
  - 详情：拖入门与 FF 模块、连线、undo/redo、保存；刷新后 IndexedDB 数据仍在
  - 打开 RS/JK/D/T/T′ 与 74LS74/112/175：均为 builtin 只读；可见层次内部（门或嵌套 FF）
  - 双击 / ⇅ 下钻，面包屑返回；下钻时无时序仿真提示
  - 边沿型仅在规定边沿更新；74LS74 异步清零/预置优先于时钟；74LS112 为下降沿
  - 基本 RS 禁止态有明确提示；组合环路/悬空有明确错误
  - 功能表可翻页；状态转换图可见；时序图可跑有限周期且波形标 0/1
  - 分析面板可折叠且不缩小画布；重新进入详情默认展开
  - 导入/导出 JSON；非法门引用明确失败
  - 小屏下侧栏可折叠，画布仍可操作
  - 若种子布局过旧：bump `FF_LAYOUT_REV` 或清站点数据后硬刷新

### 扩展优化（实现后补验）

- 方程生成：合法特性方程可生成可仿真电路；非法式报错
- 波形仪：游标与多路探针行为正确
- [x] 激励源(VCC,GND,CLK)：引脚 `drive` 标注；时序图按类型生成恒高/恒低/时钟波形；自定义电路可增删改排序引脚