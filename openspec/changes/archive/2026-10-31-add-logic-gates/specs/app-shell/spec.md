# Spec Delta: app-shell

## Purpose

纯前端应用壳：路由、布局、主题、三语、部署。

## ADDED Requirements

### Requirement: URL base and router basename

系统 SHALL 使用一致的 `/zeda/` base 与 `/zeda` basename；默认落地 `/lgc`。

#### Scenario: Unknown path

- **WHEN** 访问未知子路径  
- **THEN** 回退到 `/lgc`

### Requirement: Theme and locale

系统 SHALL 支持亮/暗与 zh-CN / en / zh-TW，并记忆选择。

### Requirement: Application chrome

系统 SHALL 提供顶栏、可折叠侧栏、底栏，并适配不同屏宽。
