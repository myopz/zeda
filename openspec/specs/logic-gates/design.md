# Design: logic-gates

## Context

阶段一交付。承接平台壳层；为 combo/ff/seq 提供门库与求值。溯源：[`docs/task/step1/task01.md`](../../../docs/task/step1/task01.md)。

## Goals / Non-Goals

**Goals**：门 CRUD 闭环、公式引擎、ANSI、单门仿真、懒真值表。

**Non-Goals（本能力交付时）**：多门连线、时钟、WASM、后端。

## Decisions

| 决策 | 理由 | 相对初稿 |
|------|------|----------|
| 权威=`formulas` | 避免 `2^n` 落库 | 废弃全量 truthTable 持久化 |
| 真值表只读派生 | 单一事实来源 | 不做公式↔表双向编辑 |
| Dexie `zeda.logic-gates` | 库名隔离 | — |
| 默认 pageSize 10 | 与后续列表同构 | 初稿 25 |
| base `/zeda` | 部署一致 | 废弃 `/zeta` |
| `GATE_META_REV` + Snowflake fixed id | 种子可修订且引用稳定 | — |

## Data model (semantic)

```ts
// 示意；字段名以实现为准
type LogicGate = {
  id: string
  name: string
  kind: 'builtin' | 'custom'
  builtinKey?: string
  inputs: { id: string; name: string }[]
  outputs: { id: string; name: string }[]
  formulas: Record<string, string> // 或等价多输出公式结构
  createdAt: number
  updatedAt: number
}
```

## Key paths

```
src/app/                          # Router、Providers
src/components/layout/            # AppShell
src/features/logic-gates/
  db/{database,repository,seed}.ts
  lib/bool-engine.ts              # 解析、求值、懒真值表页
  lib/history.ts
  components/                     # FormulaEditor、TruthTableEditor、GateSymbol、SimCanvas
  pages/                          # LogicGateListPage、LogicGateDetailPage
src/i18n/locales/
```

## Verification (smoke)

- `pnpm build`
- 主题与三语；侧栏折叠；分页/卡片；新建自定义门；改公式翻页真值表；undo；内置只读；仿真翻转输入；导入导出；刷新后数据仍在；输入数较大时页面不卡死

## Risks / Trade-offs

大输入数真值表页数极大——懒分页缓解；页码 UX 与 WASM 为后续增强。
