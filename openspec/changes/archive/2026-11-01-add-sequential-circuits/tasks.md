# Tasks: add-sequential-circuits

对照 [`docs/task/step2/task04.md`](../../../../docs/task/step2/task04.md) 与时序计划。

## 1. Shared sim

- [x] 1.1 泛化 seq-sim：模块解析注入 + 纹波 delta
- [x] 1.2 `/ff` 回归冒烟（边沿/异步/禁止态/组合环）

## 2. Shell & data

- [x] 2.1 路由/侧栏/`sequential` 三语
- [x] 2.2 Dexie + seq-modules + internals 种子；`SEQ_LAYOUT_REV`

## 3. UI

- [x] 3.1 List/Detail + Canvas（门/FF/Seq/嵌套 seq）+ 下钻
- [x] 3.2 功能/状态表、状态图、时序图

## 4. Verify

- [x] 4.1 `pnpm build` / lint
- [x] 4.2 冒烟：同步/异步计数、移位、mod-6/十进制、74ls161/90/194、嵌套 seq、三语、无 `/ff` 回归
