# zeda 第一阶段任务开发 — 逻辑门管理

## 背景

zeda 是数字逻辑电路学习/仿真平台：从逻辑门起步，逐步扩展到组合逻辑、时序逻辑、封装元器件，最终可在线上实现可执行指令的处理器。

第一阶段目标：搭好纯前端骨架，并完成「逻辑门管理」闭环（列表 / 详情设计 / 单门仿真）。

## 原始要求（验收基准）

1. 技术栈：`pnpm` + Vite + React + TypeScript + Tailwind CSS + shadcn/ui，纯前端
2. 存储：浏览器 IndexedDB
3. 性能热点后续可用 Rust + WASM（本阶段不做）
4. 主流布局：顶栏、底栏、左侧栏可折叠
5. 适配不同屏幕
6. 先做逻辑门管理；符号用美国 ANSI 标准
7. URL base：`/zeda`（文档初稿写过 `/zeta`，实现与部署统一为 **`/zeda`**）
8. 可切换主题（亮/暗）与语言（简体中文 / 英文 / 繁体中文）

### 逻辑门管理设计要点

| # | 要求 |
|---|------|
| 1 | 管理页 URL：`/zeda/lgc` |
| 2 | 左侧栏入口进入逻辑门管理 |
| 3 | 列表默认分页；`page_size` 可选；可切换卡片视图 |
| 4 | 增删改查、导入/导出、复制；内置常用门 + 用户自定义（公式，引脚可配） |
| 5 | 点行/卡片进详情，独立 URL |
| 6 | 详情可设计逻辑门；修改可 undo/redo；涉及布尔运算 |
| 7 | 内置门只读，仅可查看与仿真 |
| 8 | 画布上单门仿真输入/输出（Proteus / Multisim 风格的单门交互） |

---

## 已完成项

### 工程与壳层

- [x] Vite `base: '/zeda/'`，Router `basename="/zeda"`
- [x] Tailwind CSS v4 + shadcn/ui 组件集
- [x] AppShell：顶栏（主题 / 语言）、可折叠侧栏、底栏；主区滚动与高度传递
- [x] 主题亮/暗；i18n：`zh-CN` / `en` / `zh-TW`（localStorage 记忆）
- [x] Cloudflare Workers 静态资源部署配置（`wrangler.jsonc` + assets 准备脚本）

### 路由

- [x] `/zeda` → `/zeda/lgc`
- [x] `/zeda/lgc` 列表
- [x] `/zeda/lgc/:id` 详情

### 数据与仓储（Dexie / IndexedDB）

- [x] `LogicGate` 模型持久化；CRUD、复制、JSON 导入/导出
- [x] 种子数据：内置 AND / OR / NOT / NAND / NOR / XOR / XNOR + 示例自定义 AOI
- [x] Snowflake 风格稳定 id；读入时 `normalizeGate` 兼容旧版全量 `truthTable` 字段
- [x] **权威数据为公式** `formulas`；不再持久化全量真值表

### 布尔引擎

- [x] 公式词法/语法解析与求值（`AND/OR/NOT/XOR/XNOR` 及常见符号写法）
- [x] 非法公式明确报错，不静默吞掉
- [x] 真值表按页懒生成（由公式求值），不全量物化 `2^n`
- [x] 保留小规模 Quine–McCluskey 能力（主要用于旧数据迁移；日常编辑以公式为准）

### 列表页（`/lgc`）

- [x] 表格 / 卡片视图切换
- [x] 分页：默认 **10** 条/页，可选 10 / 25 / 50 / 100（localStorage 记忆）
- [x] 搜索；多选；新建、删除（非内置）、复制、导入、导出选中/全部
- [x] 展示符号缩略图、类型、引脚数、更新时间
- [x] 分页条贴底布局，不因当前页条数上下跳动

### 详情页（`/lgc/:id`）

- [x] 元信息、ANSI 符号预览、输入/输出引脚数量与命名（自定义可改）
- [x] 公式编辑器（可写多输出）；改公式后真值表只读刷新
- [x] 真值表 **只读展示** + 分页（默认 10）；大输入数不卡死
- [x] 本地 undo / redo；保存写入 IndexedDB
- [x] 内置门只读（不可保存/改引脚/改公式）
- [x] 重命名输入引脚时同步替换公式中的变量名

### 仿真

- [x] `SimCanvas`：切换输入高低电平，按公式求值显示输出（单门，无多门连线）

---

## 相对初稿的设计演进（已落地）

| 初稿设想 | 现状 |
|----------|------|
| base `/zeta` | 统一为 `/zeda` |
| 列表默认 25 条 | 默认 **10** 条 |
| 真值表与公式双向编辑同步 | **以公式为准**；真值表只读派生展示 |
| 全量存储 `truthTable` | 不存全量；按页懒计算 |
| 内置仅 AND/OR/NOT | 扩展为 7 种常见门 + AOI 示例 |
| 引脚数硬上限 | 输入数无产品上限；大表靠懒分页保障性能 |

---

## 待扩展 / 后续阶段（本阶段明确不做或未做完）

### 近期待增强（仍属逻辑门模块）

- [ ] 公式自动简化（SOP / QM）作为可选操作，而非隐式改写用户公式
- [ ] 大输入数下的公式校验与仿真性能提示（或 WASM 加速求值）
- [ ] 列表记住当前页码 / 视图模式（目前主要记 pageSize）
- [ ] 导出格式版本演进说明与更完整的导入校验提示
- [ ] 真值表超大 `2^n` 时页码 UI 的可用性（极多页时的跳转）
- [ ] 更多 ANSI 符号细分（复杂自定义门的版图布局）
- [ ] 单测覆盖 bool-engine（解析、求值、分页边界）

### 平台级后续阶段（路线图）

- [ ] Rust + WASM 加速布尔/仿真热点
- [ ] 多门互连的组合逻辑电路画布与网表
- [ ] 时序逻辑（触发器、时钟、波形）
- [ ] 封装元器件库与层级模块
- [ ] 更多语言包
- [ ] 后端 / 账号 / 云端同步（当前纯前端本地库）

---

## 关键路径速查

```
src/app/                          # Router、Providers
src/components/layout/            # AppShell、Header、Sidebar、Footer
src/features/logic-gates/
  db/                             # Dexie、seed、repository
  lib/bool-engine.ts              # 解析、求值、懒真值表页
  lib/history.ts                  # undo/redo
  components/                     # FormulaEditor、TruthTableEditor、
                                  # GateSymbol、SimCanvas
  pages/                          # LogicGateListPage、LogicGateDetailPage
src/i18n/locales/                 # zh-CN / en / zh-TW
```

## 验证建议

- `pnpm build` / 类型检查通过
- 冒烟：主题与三语；侧栏折叠；列表分页/卡片；新建自定义门；改公式看真值表翻页；undo；内置只读；仿真翻转输入；导入导出；刷新后数据仍在；输入数调到较大时页面不卡死
