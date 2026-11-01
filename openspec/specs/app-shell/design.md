# Design: app-shell

## Context

平台壳层，随 task01 落地；后续阶段只增侧栏入口与路由，不改默认落地 `/lgc`。溯源：[`docs/task/step1/task01.md`](../../../docs/task/step1/task01.md)。

## Goals / Non-Goals

**Goals**：统一 base、布局、主题、三语、静态部署。

**Non-Goals**：器件仿真、IndexedDB 领域模型（属各 feature）。

## Decisions

| 决策 | 理由 |
|------|------|
| `base`/`basename` = `/zeda` | 与部署一致；废弃初稿 `/zeta` |
| 默认落地 `/lgc` | 阶段一入口稳定；后续 capability 并列 |
| Cloudflare Workers assets + SPA fallback | 纯静态托管 |
| i18n 三语同步纪律 | 避免半翻译 UI |

## Key paths

```
src/main.tsx / App.tsx
src/app/router.tsx
src/app/providers.tsx
src/components/layout/{AppShell,AppHeader,AppSidebar,AppFooter}.tsx
src/i18n/
vite.config.ts          # base: '/zeda/'
wrangler.jsonc
scripts/prepare-cf-assets.mjs
```

## Verification

- `pnpm build`；主题/三语记忆；侧栏四入口；未知路径回 `/lgc`；小屏折叠仍可用  
