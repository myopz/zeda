# 约定

## 路由与导航

| 路径 | 特性 | 侧栏 i18n |
|------|------|-----------|
| `/lgc`、`/lgc/:id` | logic-gates | `nav.logicGates` |
| `/clc`、`/clc/:id` | combo-circuits | `nav.comboCircuits` |
| `/ff`、`/ff/:id` | flip-flops | `nav.flipFlops` |
| `/seq`、`/seq/:id` | sequential-circuits | `nav.sequential` |

- Router 注册于 `src/app/router.tsx`  
- 未知路径 → `/lgc`  
- 索引 `/` → `/lgc`  

## IndexedDB

| 库名 | 表 | Entity |
|------|-----|--------|
| `zeda.logic-gates` | `logicGates` | `LogicGate` |
| `zeda.combo-circuits` | `circuits` | `ComboCircuit` |
| `zeda.flip-flops` | `circuits` | `FlipFlopCircuit` |
| `zeda.sequential-circuits` | `circuits` | `SequentialCircuit` |

- `kind: 'builtin' | 'custom'`；builtin 禁改删  
- 种子重写靠 revision：`GATE_META_REV` / `CIRCUIT_LAYOUT_REV` / `FF_LAYOUT_REV` / `SEQ_LAYOUT_REV`  
- 种子 id 使用 Snowflake `fixed(...)`，跨版本稳定  

## localStorage 键

统一前缀 `zeda.`，按特性域分子前缀，例如：

- `zeda.logic-gates.metaRev`
- `zeda.circuits.*`（组合列表分页等）
- `zeda.flipflops.*`
- `zeda.sequential.*`
- 主题 / 语言键遵循现有 i18n 与 theme 实现，勿另起一套  

## i18n

- 语言：`zh-CN`、`en`、`zh-TW`  
- 资源：`src/i18n/locales/`  
- 新增 UI 字符串必须三语同步；导航键与特性文案域分开  

## 列表 / 详情 UX（同构）

列表：

- 默认分页 **10**；可选 10 / 25 / 50 / 100  
- 表格 / 卡片；搜索；多选；新建 / 删除（非内置）/ 复制 / 导入 / 导出  
- 分页条贴底，避免条数变化导致跳动  

详情：

- 左侧：元信息 + 组件库 Tab；可折叠并记忆  
- 主区：画布（门阶段为单门仿真；其余为 xyflow）  
- 自定义：undo / redo / 保存  
- 内置：只读 +「复制为自定义」  
- 时序类另附：功能/状态表、状态图、时序图（下钻时隐藏分析仿真）  

## 画布与仿真

- 画布库：`@xyflow/react`  
- 电平交互：点击输入翻转；连线可按电平着色  
- 错误：环路、多驱动、悬空关键输入、非法公式、禁止态 → 明确提示  
- 门符号：ANSI（`GateSymbol`）  

### 时钟语义（触发器 / 时序共用）

- 锁存/门控：电平敏感（使能有效时透明）  
- 边沿：理想瞬时沿；默认上升沿；器件若为下降沿须在模块元数据标明（如 `74ls112`）  
- 异步置位/清零/并行加载：优先于时钟  
- 异步纹波：行为模块在 `step` 内算清；扁平多 FF 自定义纹波 → 有限 delta 迭代  

## 导出 JSON

- 带 `version: 1`  
- 内容为权威字段（公式或网表等），不含全量真值表/波形  
- 导入失败须可见，禁止半成功静默  

## 代码风格（仓库实践）

- TypeScript 严格；特性内类型集中在 `types.ts`  
- 短函数、早返回；魔法数抽常量（如 page size keys、layout rev）  
- 注释解释约束与权衡，不复述代码  
- UI 组件优先复用 `components/ui`；不要平行造第二套 Button/Dialog  
- 提交与 PR：仅在用户明确要求时操作；遵循用户 git / PR 规则  

## 验证基线

改动后按影响面执行：

1. `pnpm build`（含 `tsc -b`）  
2. `pnpm lint`（若改动触及 eslint 范围）  
3. 对应 `openspec/specs` 场景与进行中 change 的 `tasks.md` 冒烟（路由、只读、仿真、导入导出、三语、无回归）  
