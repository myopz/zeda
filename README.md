# zeda

数字逻辑电路学习与仿真平台：纯前端、本地 IndexedDB 持久化。

**终极目标**：在浏览器内构建教学用**简易 CPU**，并用**简单汇编程序**装载、单步/运行（可下钻到门级与时序子系统）。  
**当前进度**：门 → 组合（含通路积木）→ 触发器 → 时序（含 memory 教具）→ **Zeda-8 CPU + 汇编** 已交付。ISA：[docs/isa.md](./docs/isa.md)；路线图：[docs/roadmap.md](./docs/roadmap.md)。

## 功能一览

| 模块 | 路由 | 说明 |
|------|------|------|
| 逻辑门 | `/zeda/lgc` | 公式权威、ANSI 符号、单门仿真、懒分页真值表 |
| 组合电路 | `/zeda/clc` | 多门/模块连线；加法器/编解码/MUX·ALU 等通路积木/74LS |
| 触发器 | `/zeda/ff` | RS/JK/D/T/T′ 与 74LS 代表件；功能表 / 状态图 / 时序图 |
| 时序电路 | `/zeda/seq` | 寄存器/计数器/RegFile·RAM·ROM 教具/74LS；可下钻 |
| 简易 CPU | `/zeda/cpu` | Zeda-8 汇编装载、多周期单步/运行、寄存器与内存观察 |

公共能力：亮/暗主题、简中 / 英文 / 繁中、导入导出 JSON、内置只读 +「复制为自定义」、undo/redo。

## 技术栈

- **构建**：pnpm + Vite + React 19 + TypeScript
- **样式**：Tailwind CSS v4 + shadcn/ui（Radix）
- **画布**：`@xyflow/react`
- **存储**：Dexie（IndexedDB），五特性独立库名
- **i18n**：i18next / react-i18next
- **部署**：Cloudflare Workers 静态资源（`wrangler`）

URL base 固定为 `/zeda/`（Vite `base` 与 Router `basename` 一致）。

## 快速开始

```bash
pnpm install
pnpm dev
```

本地访问：`http://localhost:5173/zeda/`（以 Vite 实际端口为准）。

```bash
pnpm build    # tsc + vite build + CF assets 准备
pnpm lint
pnpm preview
pnpm deploy   # build 后 wrangler deploy
```

## 仓库结构（摘要）

```
src/
  app/                 # Router、Providers
  components/          # AppShell、共享 UI、时序波形等
  features/
    logic-gates/
    combo-circuits/
    flip-flops/        # 含共享 seq-sim 内核
    sequential-circuits/
  i18n/
  lib/
openspec/              # OpenSpec：行为规格与变更
  specs/               # 当前系统行为真相源
  changes/             # 进行中变更 + archive/
docs/                  # 架构与工程约定
AGENTS.md
```

## 文档

| 文档 | 用途 |
|------|------|
| [AGENTS.md](./AGENTS.md) | Agent / 贡献者：边界与 OpenSpec 工作流 |
| [openspec/README.md](./openspec/README.md) | Spec-driven：`specs/` + `changes/` |
| [openspec/specs/](./openspec/specs/) | Capabilities 行为规格（Requirement / Scenario） |
| [docs/README.md](./docs/README.md) | 技术文档索引 |
| [docs/architecture.md](./docs/architecture.md) | 架构、仿真分层 |
| [docs/conventions.md](./docs/conventions.md) | 路由、存储、i18n 约定 |
| [docs/roadmap.md](./docs/roadmap.md) | 通向简易 CPU 的阶段、待实现与延后项 |
| [docs/task/](./docs/task/) | 阶段 task01–04 完整验收原文 |

行为变更请走 `openspec/changes/<name>/`（proposal → specs → design → tasks → apply → archive）。

## 路线图（摘要）

| 状态 | 内容 |
|------|------|
| 已交付 | 逻辑门、组合（datapath）、触发器、时序（memory 教具）、Zeda-8 CPU + 汇编 |
| 可选后续 | 门级下钻深化、调试增强、WASM；见 roadmap |
| 待扩展（服务北星） | 表达式→网表、FSM 编辑器、关键 MSI 代表件、布局布线等 |
| 默认延后 | 完整 74 系列、延时/STA/多时钟域、后端云同步、流水线/现代 ISA 全集；WASM 作后期性能项 |

细节与建议 change 名见 **[docs/roadmap.md](./docs/roadmap.md)**。

## License

[MIT](./LICENSE) © 2026 mr_jianlong
