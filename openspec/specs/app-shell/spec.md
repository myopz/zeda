# app-shell

## Purpose

提供 zeda 纯前端应用壳：路由基座、AppShell 布局、主题、三语 i18n 与 Cloudflare Workers 静态部署入口。各电路 capability 挂载其上。平台北星为简易 CPU + 简单汇编（见 `docs/roadmap.md`），本 capability 不承载器件仿真语义。

**溯源**：[`docs/task/step1/task01.md`](../../../docs/task/step1/task01.md) 工程与壳层条款；实现：`src/app/`、`src/components/layout/`、`vite.config.ts`、`wrangler.jsonc`。

## Requirements

### Requirement: Tech stack and frontend-only

系统 SHALL 使用 pnpm + Vite + React + TypeScript + Tailwind CSS + shadcn/ui，并以纯前端方式运行；本阶段 SHALL NOT 依赖后端业务 API。

#### Scenario: Local develop

- **WHEN** 执行 `pnpm install` 与 `pnpm dev`  
- **THEN** 可在浏览器通过 `/zeda/` 基路径访问应用

### Requirement: URL base and router basename

系统 SHALL 以 Vite `base: '/zeda/'` 与 Router `basename="/zeda"` 保持一致（初稿 `/zeta` 已废弃）。

#### Scenario: Default landing

- **WHEN** 用户访问 `/zeda` 或未知子路径  
- **THEN** 导航到 `/zeda/lgc`（不因后续 capability 改变默认落地页，除非单独 change）

### Requirement: Application chrome

系统 SHALL 提供顶栏（主题/语言）、可折叠左侧栏、底栏；主区滚动与高度传递正确；适配不同屏宽。

#### Scenario: Sidebar entries

- **WHEN** 侧栏展开  
- **THEN** 可见逻辑门 `/lgc`、组合电路 `/clc`、触发器 `/ff`、时序电路 `/seq`、简易 CPU `/cpu` 入口（i18n：`nav.logicGates` / `nav.comboCircuits` / `nav.flipFlops` / `nav.sequential` / `nav.cpu`）

#### Scenario: Collapse on small screen

- **WHEN** 用户折叠侧栏  
- **THEN** 主区画布或列表仍可操作

### Requirement: Theme and locale

系统 SHALL 支持亮/暗主题与 `zh-CN` / `en` / `zh-TW`，并在 localStorage 记忆选择；新增 UI 文案 MUST 三语同步。

#### Scenario: Persist preferences

- **WHEN** 用户切换主题或语言后刷新  
- **THEN** 选择仍然生效

### Requirement: Static deployment

系统 SHALL 支持 `pnpm build`（含 `tsc -b`、vite build、CF assets 准备）并经 Wrangler 以 SPA `not_found_handling` 部署静态资源。

#### Scenario: Production assets

- **WHEN** 执行 `pnpm build`  
- **THEN** `dist` 资源路径符合 `/zeda/` base，可 `wrangler deploy`
