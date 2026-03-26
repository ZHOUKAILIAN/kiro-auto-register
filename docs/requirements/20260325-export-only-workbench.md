# Kiro 导出型工作台收敛 - Requirements Document

**Date**: 2026-03-25
**Status**: Approved
**Author**: Codex

## 📋 Overview

### Background
当前应用已经具备 Kiro 注册、凭证兑换、账号池管理、导出能力，以及若干面向外部仓库的直接集成功能。但用户最新要求是把本仓库收敛成一个独立工作台：

- 不在当前应用里显示或依赖 `claude-api` 等外部仓库的操作入口
- 不把本应用定位成其他仓库的控制面板
- 只保留本地注册、账号管理和导出接口

这意味着应用仍然可以导出兼容目标系统消费的数据格式，但不再在 UI 或默认工作流中承担“导入、探针、同步、写文件”等下游职责。

### Objectives
- 保持 Kiro 纯接口注册、手动 OTP 回退、诊断与本地账号池能力
- 将应用收敛为“生成并导出账号数据”的独立工作台
- 移除 UI 和主流程中对外部仓库的显式耦合
- 保留导出结果的兼容格式，但不在产品界面强调具体下游仓库名称

## 👥 User Stories

### User Story 1: 作为独立工作台使用
**As a** 使用者
**I want** 在应用里只看到注册、诊断、账号池和导出
**So that** 当前仓库不需要承担其他仓库的控制职责

**Acceptance Criteria**:
- [ ] 控制台设置中不再出现 `claude-api` 地址、口令或 `cliproxyapi` 路径配置
- [ ] 操作区不再显示“导入”“验证”“同步外部仓库”等按钮
- [ ] 界面文案聚焦于“注册、保存、导出”

### User Story 2: 导出兼容数据但不绑定下游
**As a** 使用者
**I want** 导出账号 JSON
**So that** 我可以在其他地方自行消费这些数据

**Acceptance Criteria**:
- [ ] 应用仍可导出完整账号凭证数据
- [ ] 导出入口不再以具体外部仓库命名
- [ ] 当无账号或无选中项时，界面给出明确提示

### User Story 3: 注册主流程不再自动触发下游动作
**As a** 使用者
**I want** 注册成功后只保存本地账号
**So that** 应用行为更稳定、职责更单一

**Acceptance Criteria**:
- [ ] 注册完成后不会自动调用外部仓库接口
- [ ] 注册结果消息只描述本地保存与凭证状态
- [ ] 主流程不依赖外部仓库配置即可完整执行

## 🎯 Functional Requirements

### FR-1: 导出型工作台 UI
**Priority**: High
**Description**: Renderer 必须只展示当前仓库自身职责范围内的入口。

**Details**:
- Input: 本地账号、设置、注册运行态
- Processing:
  - 保留注册、保存设置、运行诊断、导出、删除相关入口
  - 移除所有外部仓库专用设置和按钮
  - 用中性文案描述导出能力
- Output: 去耦合后的工作台界面

### FR-2: 主流程去除自动下游集成
**Priority**: High
**Description**: Main process 注册工作流只负责注册、兑换、保存，不再自动执行导入、探针或外部文件写入。

**Details**:
- Input: 注册参数、OTP、诊断请求
- Processing:
  - 注册成功后继续兑换凭证并保存本地账号
  - 不再读取外部仓库配置参与流程
  - 返回聚焦本地结果的任务消息
- Output: 独立、可复用的注册结果

### FR-3: 导出接口保持兼容
**Priority**: Medium
**Description**: 导出结果仍需维持现有兼容格式，但从应用层抽象为通用导出能力。

**Details**:
- Input: 本地账号列表
- Processing:
  - 使用中性导出接口生成 JSON
  - 保持现有兼容字段，避免破坏既有消费方
- Output: 可下载的 JSON 字符串

## 🔧 Non-Functional Requirements

### Maintainability
- 下游仓库配置与能力不应继续污染主应用设置模型
- 主应用类型定义应围绕注册、账号池、导出展开

### Usability
- 用户应能一眼理解哪些操作是当前应用职责，哪些不在这里完成
- 不可执行的按钮需要明显禁用并附带原因说明

### Compatibility
- 历史账号数据继续兼容加载
- 历史设置中的多余下游字段应被安全忽略

## 🚫 Out of Scope

- 重写或删除 `targetIntegrations.ts` 内已有工具函数
- 远程联调外部仓库导入链路
- 改变现有导出 JSON 的字段结构

## 📊 Acceptance Criteria

- [ ] UI 中不再显示 `claude-api` / `cliproxyapi` 专用配置与操作
- [ ] 注册主流程不再自动触发下游导入或同步
- [ ] 导出入口保留且以中性方式命名与描述
- [ ] 类型检查、测试和构建通过
- [ ] README 与新增设计文档同步更新

## 🔗 Related Documents

- [Technical Design](../design/20260325-export-only-workbench-technical-design.md)
- [Registration Fallback Requirement](../requirements/20260325-registration-fallback-otp.md)

## 📝 Notes

- 本文档基于用户“这里最好和其他的仓库不要耦合，就提供一个导出的接口就好了，其他的比如 claude-api 不需要在我这里显示”的直接指令创建，并按用户授权自动批准执行。
