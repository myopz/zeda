# 路线图：通向简易 CPU

## 终极目标（North Star）

在浏览器内构建一台**教学用简易 CPU**，并能：

1. 用有限指令集（迷你 ISA）编写**简单汇编程序**  
2. 汇编 → 机器码装载到仿真存储  
3. 单步 / 连续运行，观察 PC、寄存器、总线/关键控制信号与内存  
4. （目标态）CPU 数据通路与控制仍可**层次下钻**到既有门 / FF / 时序模块，而不是只能黑盒跑指令  

验收意象（未来 change 再冻结）：例如能跑通「装载立即数 → 运算 → 条件跳转 / 写回内存」一类 10～30 行汇编 demo，而不是完整现代 ISA 或 OS。

## 现状（已交付）

| 层级 | Capability | 状态 |
|------|------------|------|
| 壳层 | `app-shell` | 已交付 |
| 门 | `logic-gates` | 已交付 |
| 组合 | `combo-circuits` | 已交付 |
| 触发器 | `flip-flops` | 已交付 |
| 时序 MSI | `sequential-circuits` | 已交付 |

以上构成 CPU 的**器件与子系统地基**；尚缺：运算与通路积木、存储模型、控制单元、ISA/汇编工具链、CPU 整机与程序运行 UX。

## 通往 CPU 的阶段规划

后续一律按 OpenSpec：`openspec/changes/<name>/` → archive → 合并 `openspec/specs/`。  
下表为**规划顺序**（可并行微调，但依赖方向大致固定）。

```mermaid
flowchart LR
  Done["已交付: 门/组合/FF/时序"] --> P5["P5 通路积木 ALU/MUX/总线"]
  P5 --> P6["P6 存储 ROM/RAM/RegFile"]
  P6 --> P7["P7 控制 FSM/微码"]
  P7 --> P8["P8 简易 CPU 整机"]
  P8 --> P9["P9 汇编器与程序运行"]
  P9 --> Stretch["可选: WASM / 更强调试"]
```

| 阶段 | 建议 change 名 | 目标产出 | 依赖 |
|------|----------------|----------|------|
| **P5** | `add-datapath-blocks` | ALU、多路选择/分配、总线驱动等**可复用组合/时序积木**；可下钻 | combo + seq |
| **P6** | `add-memory-model` | 行为级 ROM/RAM、寄存器堆；读写时序约定（理想周期） | P5 或与其交错 |
| **P7** | `add-control-unit` | 硬布线或微程序控制；指令译码 → 控制信号表；可与简易 ISA 草案对齐 | P5–P6 |
| **P8** | `add-simple-cpu` | 新 capability（建议独立 feature，勿塞进 `sequential-circuits`）：PC/IR/ALU/RegFile/Mem 互联的教学 CPU | P5–P7 |
| **P9** | `add-asm-toolchain` | 汇编语法、汇编器、装载、单步/运行、断点或观察窗；示例程序 | P8 |
| **P10+** | 按需 | WASM 加速、更完整调试、多程序、外设实验等 | P9 |

### 简易 CPU 范围草案（待 P8 proposal 冻结）

规划时默认偏向**可教、可验收**，而非真实硅片：

- 位宽：先 **4 位或 8 位**（二选一在 P8 proposal 写死）  
- 指令：十余条量级（如 LOAD/STORE/MOV/ALU/JMP/JZ/HALT）  
- 存储：小容量理想 RAM/ROM（如 256 字）  
- 控制：单周期或极简多周期（P7/P8 选定一种，避免同时上流水线）  
- **不做（直至单独 change）**：流水线冒险全套、缓存、中断控制器产品化、特权级、浮点、多核  

### 汇编与运行草案（待 P9 proposal 冻结）

- 文本汇编 → 机器码；错误行号可见  
- 装载到 CPU 仿真存储；Reset / Step / Run  
- 最小示例：加法累加、条件跳转循环、简单内存搬运  
- 可选后期：反汇编视图、波形与指令步进联动  

## 已有能力上的「待扩展」（服务北星，非阻塞）

这些**增强现有四特性**，优先做对 P5–P9 有杠杆的；其余降优先。

### logic-gates

| 项 | 相对北星 | 说明 |
|----|----------|------|
| 公式可选简化（SOP/QM） | 低 | 教学便利 |
| bool-engine 单测 / 大输入提示 | 中 | 稳定性 |
| WASM 求值 | 后期 | P10+ |

### combo-circuits

| 项 | 相对北星 | 说明 |
|----|----------|------|
| **表达式 → 门级网表综合** | 高 | 加速 ALU/译码器搭建 |
| 自动布局 / 正交布线 | 中 | 大数据通路可读性 |
| 更多 MSI（MUX/DEMUX/比较器等）若未进 P5 | 高 | 可并入 `add-datapath-blocks` |
| 完整 74 系列 | 低 | 代表件原则；按 CPU 需要点名追加 |

### flip-flops / sequential-circuits

| 项 | 相对北星 | 说明 |
|----|----------|------|
| 任意模 N 向导 | 低 | CPU 通常固定位宽计数 |
| FSM 专用编辑器 | **高（对齐 P7）** | 控制单元硬布线/状态机 |
| 方程 → 网表综合 | 中 | 设计辅助 |
| 完整 74 系列计数/移位 | 低 | 按需代表件 |
| 延时/建立保持/多时钟域 | **默认不做** | 与理想教学 CPU 目标冲突时再开 change |

## 明确延后 / 默认不做

与北星无强相关或易膨胀范围：

- 后端账号、云同步  
- PCB / 模拟电路  
- 传输延迟、STA、竞争冒险专项产品化  
- 完整 74LS/4000 库、现代 ISA（x86/ARM/RISC-V 全集）  
- 流水线 CPU、乱序、MMU、完整外设 SoC  

若要做，必须单独 OpenSpec change，并写清对「简易 CPU + 简单汇编」验收的增益。

## 架构约束（实现时）

- CPU / 汇编工具链 = **新 feature 切片**（独立路由、Dexie、i18n），见 [architecture.md](./architecture.md)  
- 继续：层次复用既有门/FF/seq 模块；仿真失败可见  
- 组合 vs 时序内核边界不变；CPU 周期推进建在 `seq-sim` 或其上的 **CPU 运行时**，不要把指令语义塞进 `netlist.ts`  

## 下一步建议

1. 开 change **`add-datapath-blocks`**（或先写短 proposal 冻结 ALU 位宽与积木清单）  
2. 并行起草 **迷你 ISA 一页纸**（可放在未来 `add-simple-cpu` / `add-asm-toolchain` 的 proposal 附录），避免 P5–P7 积木与指令集错位  
3. 不把「完整器件库」当主路径；只补 CPU 路径上缺的代表模块  
