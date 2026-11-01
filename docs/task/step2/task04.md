# zeda 第四阶段任务开发 — 时序逻辑电路管理

## 背景

zeda 是数字逻辑电路学习/仿真平台：从逻辑门起步，逐步扩展到组合逻辑、时序逻辑、封装元器件，最终可在线上实现可执行指令的处理器。

第一阶段、第二阶段、第三阶段已完成详见 [task01.md](../step1/task01.md)、[task02.md](../step1/task02.md)、[task03.md](./task03.md)。

第四阶段（step2 第二步）目标：完成「时序逻辑电路管理」闭环——列表管理、画布连线设计、理想时钟时序仿真；内置常用计数器 / 寄存器与代表性 74LS 器件；层次复用触发器模块，并支持下钻至逻辑门。

## 原始要求（验收基准）

继承阶段一～三不变项：

1. 技术栈：`pnpm` + Vite + React + TypeScript + Tailwind CSS + shadcn/ui，纯前端
2. 存储：浏览器 IndexedDB（Dexie）
3. 性能热点后续可用 Rust + WASM（本阶段不做）
4. AppShell：顶栏、底栏、左侧栏可折叠；适配不同屏幕
5. URL base：`/zeda`
6. 可切换主题（亮/暗）与语言（简体中文 / 英文 / 繁体中文）
7. 逻辑门符号继续用美国 ANSI 标准（画布上门实例复用阶段一 `GateSymbol`）
8. 触发器阶段（`/ff`）作为时序叶子与设计参考，保持独立，不改其 schema

本阶段新增：

9. 时序逻辑电路的管理与画布连线设计（门 + 触发器模块 + 时序目录模块 + 嵌套时序电路）
10. 常用计数器：二进制同步/异步、十进制同步/异步、同步加/减、模 N（代表模 6）
11. 常用寄存器：数码寄存器、左移/右移移位寄存器
12. 代表性 74LS 时序器件（非整系列）
13. 层次抽取与组件复用；下钻查看直至底层逻辑门
14. 理想时钟时序仿真；功能/状态表、状态转换图、时序图

### 时序电路管理设计要点

| # | 要求 |
|---|------|
| 1 | 管理页 URL：`/zeda/seq`；详情：`/zeda/seq/:id` |
| 2 | 左侧栏新增「时序电路」入口进入管理页 |
| 3 | 列表默认分页（默认 **10**）；`page_size` 可选 10 / 25 / 50 / 100；可切换卡片视图；搜索 |
| 4 | 增删改查、导入/导出、复制；内置教材/TTL 时序电路 + 用户自定义画布电路 |
| 5 | 点行/卡片进详情，独立 URL |
| 6 | 详情为图编辑器：放置门 / FF 模块 / Seq 模块 / 其它时序电路、引脚连线、元信息编辑；修改可 undo/redo |
| 7 | 内置电路只读，仅可查看与仿真；可复制为自定义后编辑 |
| 8 | 画布上时序仿真：切换对外输入电平、时钟推进；显示输出与连线电平；详情展示功能/状态表、状态转换图、时序图 |
| 9 | 可下钻：seq → FF → 门；下钻结构只读 |

---

## 承接自阶段一～三（复用，不重做）

- [x] Vite `base: '/zeda/'`，Router `basename="/zeda"`，AppShell / 主题 / i18n
- [x] `LogicGate` 模型、仓储、种子门；`bool-engine` 公式求值
- [x] `GateSymbol` ANSI SVG
- [x] 组合电路 / 触发器列表详情 UX（分页、卡片、多选、导入导出、删除确认、侧栏折叠）
- [x] `@xyflow/react` 画布模式；`useHistoryState` / undo-redo；Snowflake id
- [x] 触发器 `ff-modules`、层次 `internals`、理想时钟语义（边沿 / 电平 / 异步优先）
- [x] Cloudflare Workers 静态部署配置（新 chunk 自动纳入 `/zeda/`）

**不复用为仿真内核**：组合电路 `netlist.ts`（禁环路、无状态、无时钟）。本阶段基于触发器时序求值器扩展共享内核。

首页重定向保持 `/zeda` → `/zeda/lgc`（不改阶段一默认落地页）。

---

## 本阶段交付清单

### 路由与导航

- [x] `/zeda/seq` 时序电路列表
- [x] `/zeda/seq/:id` 时序电路详情（设计 + 仿真 + 三图）
- [x] 侧栏增加「时序电路」→ `/seq`（i18n：`nav.sequential`）
- [x] 路由表在现有 `/lgc`、`/clc`、`/ff` 旁并列注册；未知路径仍回退到既有默认

### 数据与仓储（Dexie / IndexedDB）

- [x] 独立库：`zeda.sequential-circuits`（与 gates / combo / flip-flops 分离）
- [x] `SequentialCircuit` 模型持久化；CRUD、复制、JSON 导入/导出（`version: 1`）
- [x] 种子数据：寄存器 / 计数器 / 代表 74LS（见下方冻结清单）；`SEQ_LAYOUT_REV` 控制重写
- [x] 读入时 `normalizeSequential` 兼容缺省字段；稳定 Snowflake id（`fixed(301…311)`）
- [x] **权威数据为网表 + 模块行为（特性方程/次态函数）**；不持久化全量功能表或波形采样

### 数据模型要点

```ts
type CircuitPin = { id: string; name: string; drive?: 'signal' | 'clk' | 'vcc' | 'gnd' }

type SeqNode =
  | {
      id: string
      kind: 'gate'
      ref: { builtinKey?: string; gateId?: string }
      position: { x: number; y: number }
    }
  | {
      id: string
      kind: 'ff'
      /** 阶段三触发器目录，如 d_edge / t_edge */
      moduleKey: string
      position: { x: number; y: number }
    }
  | {
      id: string
      kind: 'seq'
      /** 本阶段时序目录，如 counter_bin_sync_4 */
      moduleKey: string
      position: { x: number; y: number }
    }
  | {
      id: string
      kind: 'circuit'
      /** 嵌套其它 SequentialCircuit */
      circuitId: string
      position: { x: number; y: number }
    }

type CircuitWire = {
  id: string
  from: { nodeId: 'io' | string; pinId: string }
  to: { nodeId: 'io' | string; pinId: string }
}

type SequentialCircuit = {
  id: string
  name: string
  description?: string
  kind: 'builtin' | 'custom'
  builtinKey?: string
  /** 叶子行为模型键（与 builtinKey 对齐）；有嵌套模块节点时可清空 */
  behaviorKey?: string
  group: string
  inputs: CircuitPin[]
  outputs: CircuitPin[]
  nodes: SeqNode[]
  wires: CircuitWire[]
  createdAt: number
  updatedAt: number
}
```

约束：

- 叶子：阶段一门、阶段三 FF 目录模块、本阶段 Seq 目录模块
- **自定义时序电路可作为节点嵌套进另一自定义时序电路**（`kind:'circuit'`）；嵌套环明确报错
- 不可嵌套 `FlipFlopCircuit` / `ComboCircuit` 实体（仅引用 FF **目录**模块）
- 门引用解析失败须明确报错，不静默当成恒 0
- 禁止无状态源隔断的纯组合环；行为级种子可用 `behaviorKey` 仿真，拓扑用层次网表展示
- 复合种子以嵌套 `ff` / `seq` 节点复用下层模块

### 画布编辑器

- [x] 复用 `@xyflow/react` 作为节点/边图编辑底座
- [x] 从逻辑门库、触发器模块、时序模块、其它时序电路面板拖入实例
- [x] 引脚级连线；选中、删除节点/边；画布平移缩放
- [x] 自定义电路可编辑元信息（名称、描述、对外 IO 命名、分组）
- [x] 本地 undo / redo；「保存」写入 IndexedDB
- [x] 内置电路：屏蔽保存/改拓扑/改 IO，仅可查看与仿真；提供「复制为自定义」
- [x] 模块下钻：画布组件中心 ⇅ / 双击进入内部网表；面包屑 /「返回上层」/ Esc；下钻时跳过时序仿真（结构只读）

### 时序仿真

- [x] 共享时序求值内核（由触发器 `seq-sim` 泛化）：行为级模块 + 组合云 DAG
- [x] **锁存/门控 / 边沿 / 异步优先**：继承阶段三约定
- [x] **异步纹波**：行为模块在 `step` 内一次算清；扁平多 FF 自定义纹波做有限 delta 迭代
- [x] 非法拓扑、禁止态明确提示，不静默吞掉
- [x] 不做：传输延迟、建立保持检测、竞争冒险专项、多时钟域产品化

### 功能表 / 状态转换图 / 时序图

- [x] **功能/状态表**：由行为模型按页懒生成；宽位器件避免全输入笛卡尔爆炸（分页 / 激励子集）
- [x] **状态转换图**：对目录种子展示（只读 SVG）
- [x] **时序图**：理想时钟 + 输入激励 → 输出波形；有限采样窗口；波形标注 0/1
- [x] 分析面板可折叠（展开向下，不挤占画布固定高度）；进入详情默认展开

### 列表页（`/seq`）

- [x] 表格 / 卡片视图切换
- [x] 分页：默认 **10** 条/页，可选 10 / 25 / 50 / 100（`zeda.sequential.pageSize` 记忆）
- [x] 搜索；多选；新建、删除（非内置）、复制、导入、导出选中/全部
- [x] 展示类型（内置/自定义）、IO 数、节点数、更新时间；分类标签

### 详情页（`/seq/:id`）

- [x] 左侧侧栏（基本信息 / 组件库 Tab）+ 画布主区；侧栏折叠记忆 `zeda.sequential.sideCollapsed`
- [x] 组件面板：逻辑门 + FF 模块 + Seq 模块 + 其它时序电路（排除自身）
- [x] 仿真：点击输入翻转电平；边沿型随 CLK 边沿更新；时序 Tab 可跑有限周期波形
- [x] 详情附加面板：功能/状态表、状态转换图、时序图（下钻时隐藏）
- [x] 内置只读策略与触发器详情一致；全部目录种子可下钻看层次内部
- [x] 特性方程只读展示；**不要求**方程综合出网表

### i18n

- [x] 新增 `sequential` 文案域与 `nav.sequential`；`zh-CN` / `en` / `zh-TW` 三语同步

### 共享仿真内核

- [x] 泛化触发器 `seq-sim`：可注入模块解析（FF + Seq 统一 `step` 接口）
- [x] 纹波有限 delta 迭代；`/ff` 原有种子行为无回归

---

## 内置时序电路目录（冻结清单）

种子必须覆盖下列条目；名称可本地化，行为与 IO 语义固定。

实现约定：

- **全部为 `kind: 'builtin'` 只读**；可「复制为自定义」后编辑
- 拓扑均为 **层次化 internals**；仿真权威走目录 `step`（或嵌套 FF 步进）
- `SEQ_LAYOUT_REV` bump 后重写种子拓扑

### 寄存器

| builtinKey | 名称 | 时钟模型 | IO / 行为要点 | 层次复用 |
|------------|------|----------|----------------|----------|
| `reg_4` | 4 位数码寄存器 | 上升沿 | 入 D0–D3,CLK,nLOAD,nCLR；出 Q0–Q3 | 4× `d_edge` + 门 |
| `shift_reg_4_left` | 4 位左移寄存器 | 上升沿 | 入 SI,CLK；出 Q0–Q3（可简化并行加载） | 4× `d_edge` 链 |
| `shift_reg_4_right` | 4 位右移寄存器 | 上升沿 | 入 SI,CLK；出 Q0–Q3 | 同上镜像 |

### 计数器（教材结构）

| builtinKey | 名称 | 时钟模型 | IO / 行为要点 | 层次复用 |
|------------|------|----------|----------------|----------|
| `counter_bin_sync_4` | 4 位同步二进制加法计数器 | 上升沿 | 入 CLK,EN；出 Q0–Q3 | T/`t_edge` 链 + 进位组合 |
| `counter_bin_async_4` | 4 位异步（纹波）二进制加法计数器 | 上升沿级联 | 入 CLK；出 Q0–Q3 | Q→下一级 CLK |
| `counter_bin_sync_updown_4` | 4 位同步二进制加/减计数器 | 上升沿 | 入 CLK,UP；出 Q0–Q3 | up/down 组合 + FF 链 |
| `counter_dec_sync` | 同步十进制计数器 | 上升沿 | 0–9 循环 | 同步二进制 + 模 10 反馈 |
| `counter_dec_async` | 异步十进制计数器 | 纹波 | 0–9 循环 | 纹波 + 模 10 反馈 |
| `counter_mod6_sync` | 同步模 6 计数器 | 上升沿 | 0–5 循环（N 进制代表） | 同步二进制 + 模 6 反馈 |

### 74LS 代表（builtin 复合件，非整系列）

| builtinKey | 器件 | IO / 行为要点 | 层次复用 |
|------------|------|----------------|----------|
| `74ls161` | 同步 4 位二进制计数器 | CLK、nCLR、nLOAD、ENP/ENT、A–D、QA–QD、RCO | 同步计数 + 加载/使能逻辑 |
| `74ls90` | 十进制计数器 | 异步结构代表（教学简化引脚） | 纹波 + 模 10 |
| `74ls194` | 4 位双向通用移位寄存器 | S0/S1：保持 / 右移 / 左移 / 并行加载 | 4× `d_edge` + 模式组合 |

**模 N**：种子只冻结 **mod-6**；其它 N 由用户自定义（同步计数 + 反馈清零/加载）完成。  
**减法**：由同步 up/down 覆盖；不做单独异步减法器。

自定义电路：用户可在画布上用门 + FF 目录模块 + Seq 目录模块 + 其它时序电路搭接。

---

## 相对初稿的设计落地约定

| 初稿设想 | 本阶段约定 |
|----------|------------|
| 复杂时序电路管理/设计/仿真 | `/seq` 列表+详情闭环 + 时钟感知行为仿真 |
| 触发器作设计参考 | 独立 `SequentialCircuit`；叶子引用 FF 目录；不改 `/ff` schema |
| 计数器含同步/异步、N/十进制、加/减 | 上表冻结；N=模 6 代表；减法=同步 up/down |
| 寄存器含数码 / 左移 / 右移 | `reg_4` + 左/右移位各一 |
| 74LS 系列 | **3** 颗：161 / 90 / 194 |
| 抽取与组件复用 | 目录模块 + 层次 internals；自定义可嵌套其它 seq 电路 |
| 下钻到逻辑门 | 全目录层次；下钻结构只读 |
| 与触发器关系 | 共享泛化 `seq-sim`；独立 Dexie / 路由 / 列表 |

---

## 扩展优化（本阶段闭环后的增强项）

> 下列项**不纳入**本阶段原始验收必须。

- [ ] 任意模 N 可视化向导（自动生成反馈逻辑）
- [ ] 更完整波形工具（游标、多路探针、导出）
- [ ] FSM 专用状态机编辑器
- [ ] 完整 74LS / 4000 时序器件库
- [ ] 建立保持时间违规提示（教学用简化模型）
- [ ] 下钻视图内可仿真
- [ ] `seq-sim` / 功能表自动化单测
- [ ] 电路缩略图；导入版本演进说明

---

## 明确不做 / 后续阶段

### 本阶段明确不做

- [ ] 完整 74LS / 4000 系列器件库
- [ ] 任意 N 自动综合向导（主闭环）
- [ ] FSM 专用产品化编辑器
- [ ] ALU / 处理器实验链路
- [ ] 传输延迟、竞争冒险自动分析、多时钟域产品化
- [ ] 修改 `combo-circuits` / `flip-flops` 持久化 schema
- [ ] Rust + WASM 加速
- [ ] 后端 / 账号 / 云端同步
- [ ] PCB / 物理封装；模拟电路
- [ ] 除简中 / 英 / 繁中以外的语言包

### 平台级后续阶段（路线图）

- [ ] 有限状态机与控制器子系统
- [ ] 封装元器件与跨特性层级模块
- [ ] WASM 加速布尔/仿真热点
- [ ] 可执行指令的处理器实验链路

---

## 关键路径速查

```
src/app/router.tsx                 # 注册 /seq、/seq/:id
src/components/layout/AppSidebar.tsx
src/features/logic-gates/          # 复用：门库、bool-engine、GateSymbol
src/features/flip-flops/
  lib/ff-modules.ts                # FF 目录（叶子复用）
  lib/seq-sim.ts                   # 泛化共享时序求值（或抽出 shared）
  lib/internals.ts                 # FF 层次构图助手（复用）
src/features/sequential-circuits/
  types.ts                         # SequentialCircuit / Node / Wire
  db/                              # Dexie、seed（SEQ_LAYOUT_REV）、repository
  lib/
    seq-modules.ts                 # 时序目录、引脚、次态、方程
    internals.ts                   # 层次化 internals + 下钻
    func-table.ts                  # 功能/状态表懒分页
    state-diagram.ts               # 状态图数据
    groups.ts
    pin-drive.ts                   # 可复用或薄封装 FF pin-drive
  components/                      # Canvas、侧栏、分析面板
  pages/
    SequentialListPage.tsx
    SequentialDetailPage.tsx
src/i18n/locales/                  # sequential + nav.sequential
```

## 验证建议

### 主闭环

- `pnpm build` / 类型检查通过
- 冒烟：
  - 侧栏可进 `/seq`；主题与三语文案正常
  - 列表分页 / 卡片 / 搜索；新建自定义；删除非内置；复制内置为可编辑副本
  - 详情：拖入门 / FF / Seq / 其它时序电路、连线、undo/redo、保存；刷新后 IndexedDB 仍在
  - 打开各 builtin：只读；可下钻至 FF 与门
  - 同步计数进位正确；异步纹波计数正确；mod-6 / 十进制回绕；移位左/右
  - 74LS161 异步清零 / 并行加载 / RCO；74LS194 模式切换
  - 自定义嵌套另一 seq 电路；环引用明确报错
  - 功能/状态表可翻页；状态图可见；时序图有限周期且标 0/1
  - 导入/导出 JSON；`/ff` 原有触发器仿真无回归
  - 若种子布局过旧：bump `SEQ_LAYOUT_REV` 或清站点数据后硬刷新

### 扩展优化（实现后补验）

- 模 N 向导：合法 N 生成可仿真电路；非法输入报错
- 波形仪：游标与多路探针行为正确
