# zeda 文档

- **行为真相源**：[`openspec/specs/`](../openspec/specs/)  
- **变更流程**：[`openspec/README.md`](../openspec/README.md)  
- **阶段任务全文**：[`task/`](./task/)  

## 文档地图

| 路径 | 内容 |
|------|------|
| [roadmap.md](./roadmap.md) | 北星（简易 CPU + 汇编）、P5–P9 状态、待扩展与延后 |
| [isa.md](./isa.md) | Zeda-8 迷你 ISA 一页纸 |
| [architecture.md](./architecture.md) | 整体架构、特性边界、仿真分层、部署 |
| [conventions.md](./conventions.md) | 路由、存储、i18n、种子、导出、UX 约定 |
| [task/README.md](./task/README.md) | 阶段 task01–04 全文索引 |
| [../openspec/README.md](../openspec/README.md) | OpenSpec：specs / changes / archive |
| [../AGENTS.md](../AGENTS.md) | Agent 硬边界与工作流 |

## 与其它目录的关系

| 位置 | 角色 |
|------|------|
| `openspec/specs/` | 当前行为 Source of truth |
| `openspec/changes/` | 进行中变更；完成后进 `archive/` |
| `docs/task/` | 阶段完整验收原文（写作/追溯） |
| `docs/` 其它 | 架构、约定、路线图 |
| `.tmp/`、`.cursor/plans/` | 草稿；可与 `docs/task` 同步，不以之为最终真相 |

## 维护规则

1. 改行为：OpenSpec change → 合并 specs；重大阶段可先更新/对照 `docs/task`  
2. 冲突：代码 + `openspec/specs` > `docs/task` > 草稿  
3. 中文说明；标识符/路径/命令保持原文  
