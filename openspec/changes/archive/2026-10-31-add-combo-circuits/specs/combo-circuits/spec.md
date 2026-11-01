# Spec Delta: combo-circuits

## Purpose

组合电路列表/画布/纯组合网表仿真与冻结目录。

## ADDED Requirements

### Requirement: Combinational evaluation

系统 SHALL 按网表求值且无时钟；环路/悬空/多驱动/缺门引用明确报错。

#### Scenario: Toggle inputs on canvas

- **WHEN** 点击对外输入翻转电平  
- **THEN** 输出与连线电平更新

### Requirement: Frozen catalog

系统 SHALL 提供 half_adder/full_adder、encoder_4_2、priority_encoder_8_3、decoder_2_4/3_8、seven_seg_decoder、74ls138/148/283。

### Requirement: Canvas editing

系统 SHALL 支持门/模块拖放连线、undo/redo、builtin 只读与复制为自定义、下钻门级 internals。
