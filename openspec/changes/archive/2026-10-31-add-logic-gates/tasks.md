# Tasks: add-logic-gates

对照 [`docs/task/step1/task01.md`](../../../../docs/task/step1/task01.md) 已完成清单。

## 1. Shell

- [x] 1.1 Vite `base: '/zeda/'` + Router `basename="/zeda"`
- [x] 1.2 Tailwind v4 + shadcn/ui
- [x] 1.3 AppShell：顶栏/可折叠侧栏/底栏；主题亮暗；i18n zh-CN/en/zh-TW
- [x] 1.4 Cloudflare Workers assets + prepare 脚本

## 2. Data & engine

- [x] 2.1 Dexie `zeda.logic-gates` + seed（AND/OR/NOT/NAND/NOR/XOR/XNOR + AOI）
- [x] 2.2 repository：CRUD/复制/导入导出；`normalizeGate`
- [x] 2.3 bool-engine：解析求值；非法公式报错；懒真值表；QM 仅迁移

## 3. UI

- [x] 3.1 ListPage：表格/卡片、分页默认 10、搜索多选导入导出
- [x] 3.2 DetailPage：公式编辑、真值表只读分页、undo/redo、内置只读
- [x] 3.3 GateSymbol ANSI + SimCanvas 单门仿真
- [x] 3.4 重命名输入脚同步替换公式变量

## 4. Verify

- [x] 4.1 `pnpm build`
- [x] 4.2 冒烟：主题三语、分页卡片、新建改公式、undo、内置只读、仿真、导入导出、刷新仍在
