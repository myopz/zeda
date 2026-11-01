# Spec Delta: sequential-circuits

## Purpose

时序电路（寄存器/计数器/代表 74LS）管理、层次复用与仿真分析。

## ADDED Requirements

### Requirement: Node kinds

系统 SHALL 支持 `gate` / `ff` / `seq` / `circuit`；可嵌套其它 SequentialCircuit（环检测）；不可嵌套 FF/Combo 实体表。

### Requirement: Shared sequential engine

系统 SHALL 使用可注入模块解析的共享 seq-sim；纹波有限 delta；保持 flip-flops 行为无回归。

### Requirement: Frozen catalog

系统 SHALL 提供 reg_4、shift_reg_4_left/right、counter_bin_sync_4、counter_bin_async_4、counter_bin_sync_updown_4、counter_dec_sync/async、counter_mod6_sync、74ls161/90/194。

#### Scenario: Drill to gates

- **WHEN** 对 builtin 连续下钻  
- **THEN** 可达 FF 模块与门级拓扑（结构只读）
