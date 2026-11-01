# Spec Delta: flip-flops

## Purpose

触发器管理与理想时钟仿真，以及功能表/状态图/时序图。

## ADDED Requirements

### Requirement: Sequential simulation semantics

系统 SHALL 用行为级 FF + 组合云求值；异步优先；禁止纯门环；不使用 combo netlist 作时序内核。

#### Scenario: Edge only on edge

- **WHEN** 边沿型且时钟无有效沿  
- **THEN** Q 不因数据脚电平变化而更新

### Requirement: Frozen catalog

系统 SHALL 提供 rs_basic_nor/rs_gated/jk_gated/jk_edge/d_edge/t_edge/t_bar_edge 与 74ls74/112/175（builtin）。

### Requirement: T-bar semantics

T′ SHALL 满足 \(Q^{n+1}=\overline{T\oplus Q^n}\)。

### Requirement: Analysis views

系统 SHALL 提供懒分页功能表、状态图、有限周期时序图；下钻时跳过仿真。
