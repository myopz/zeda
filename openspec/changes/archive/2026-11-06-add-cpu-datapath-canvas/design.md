# Design: add-cpu-datapath-canvas

## Authority

教学电路模式下，`datapath-sim` 协调各积木 `evaluate`/`step`（regfile、ram_16x8、alu_8、控制相位）为仿真权威；画布展示节点/总线高亮。

`cpu-runtime`（256 字）保留；可选对照步进，不一致时显式报错。

## Memory

`TEACHING_MEM_SIZE = 16`，复用 `ram_16x8` 行为语义（同步写、组合读约定由 datapath 周期包装对齐多周期控制）。

## UI

Circuit Tab：只读 React Flow datapath + Reset/Step/Run；Asm Tab：既有编辑器。装载写入教学内存映像。

## Drill

节点绑定 `moduleKey` 时复用 combo/seq `build*Internals` 下钻栈（与 seq Detail 同类）。
