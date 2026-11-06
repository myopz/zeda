# OpenSpec（zeda）

本仓库采用 [OpenSpec](https://openspec.dev/) 风格的 **spec-driven** 流程。

- **`specs/`**：当前系统行为真相源（按 capability；Requirement + Scenario + design）
- **`changes/`**：进行中变更；完成后进入 `archive/`
- **历史任务全文**：[`docs/task/`](../docs/task/)（由阶段 task01–04 沉淀；openspec 规格自其与 `.cursor/plans` 提炼并保持可验收）

```text
openspec/
├── config.yaml
├── specs/<capability>/{spec,design}.md
├── changes/
│   ├── README.md
│   └── archive/YYYY-MM-DD-<name>/
│       ├── proposal.md
│       ├── design.md
│       ├── tasks.md
│       └── specs/<capability>/spec.md   # 当时 delta
└── README.md
```

## 工作流

```text
proposal → specs（delta）→ design → tasks → apply → archive → 合并进 specs/
```

## Capability 索引（已交付）

| Capability | 路由 | Spec | 任务溯源 |
|------------|------|------|----------|
| [app-shell](./specs/app-shell/spec.md) | 壳层 | [spec](./specs/app-shell/spec.md) · [design](./specs/app-shell/design.md) | [task01](../docs/task/step1/task01.md) |
| [logic-gates](./specs/logic-gates/spec.md) | `/lgc` | [spec](./specs/logic-gates/spec.md) · [design](./specs/logic-gates/design.md) | [task01](../docs/task/step1/task01.md) |
| [combo-circuits](./specs/combo-circuits/spec.md) | `/clc` | [spec](./specs/combo-circuits/spec.md) · [design](./specs/combo-circuits/design.md) | [task02](../docs/task/step1/task02.md) |
| [flip-flops](./specs/flip-flops/spec.md) | `/ff` | [spec](./specs/flip-flops/spec.md) · [design](./specs/flip-flops/design.md) | [task03](../docs/task/step2/task03.md) |
| [sequential-circuits](./specs/sequential-circuits/spec.md) | `/seq` | [spec](./specs/sequential-circuits/spec.md) · [design](./specs/sequential-circuits/design.md) | [task04](../docs/task/step2/task04.md) |
| [cpu](./specs/cpu/spec.md) | `/cpu` | [spec](./specs/cpu/spec.md) · [design](./specs/cpu/design.md) | ISA [`docs/isa.md`](../docs/isa.md)；archive P5–P9 |

## 北星与后续 change

终极目标：简易 CPU + 简单汇编。见 [`docs/roadmap.md`](../docs/roadmap.md)、[`docs/isa.md`](../docs/isa.md)。

| 顺序 | Change 名 | 状态 |
|------|-----------|------|
| P5 | `add-datapath-blocks` | 已归档 2026-11-06 |
| P6 | `add-memory-model` | 已归档 2026-11-06 |
| P7 | `add-control-unit` | 已归档 2026-11-06 |
| P8 | `add-simple-cpu` | 已归档 2026-11-06 |
| P9 | `add-asm-toolchain` | 已归档 2026-11-06 |
| — | `add-cpu-datapath-canvas` | 已归档 2026-11-06（教学 16×8 电路 Tab） |

已归档变更见 [`changes/archive/`](./changes/archive/)。Agent 约定：[`AGENTS.md`](../AGENTS.md)。
