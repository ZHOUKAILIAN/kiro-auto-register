# kkddytd claude-api 兼容增强 - Requirements Document

**Date**: 2026-03-25
**Status**: Approved
**Author**: Codex

## 📋 Overview

### Background
当前仓库已经具备 `claude-api` 直接导入能力，但导入逻辑默认固定调用 `/v2/accounts/import-by-token`。用户明确希望兼容 [kkddytd/claude-api](https://github.com/kkddytd/claude-api)，并且本轮可以暂时不处理 `cliproxyapi`。

### Objectives
- 兼容 `kkddytd/claude-api` 当前管理端点与鉴权方式
- 在不同版本或分支之间保持尽可能稳的导入行为
- 不影响现有 Kiro 注册、凭证兑换和本地账号保存链路

## 👥 User Stories

### User Story 1: 导入到 kkddytd/claude-api
**As a** 使用者
**I want** 已注册的账号能直接导入到 `kkddytd/claude-api`
**So that** 我不需要手工整理格式或判断服务端版本

**Acceptance Criteria**:
- [ ] 应用能够使用 `Authorization: Bearer <adminPassword>` 调用管理端点
- [ ] 优先兼容 `/v2/accounts/import-by-token`
- [ ] 当目标版本不支持该端点时，应用能回退到 `/v2/accounts/import`
- [ ] 导入结果能在界面和日志里给出明确提示

### User Story 2: 兼容历史或分支差异
**As a** 使用者
**I want** 不同 `claude-api` 版本都尽量可用
**So that** 我不需要关心对方部署的是哪一版

**Acceptance Criteria**:
- [ ] 导入逻辑会根据接口可用性自动选择兼容模式
- [ ] 对于无法回退导入的账号，返回明确原因
- [ ] 网络错误不会造成应用崩溃

## 🎯 Functional Requirements

### FR-1: Bearer 鉴权兼容
**Priority**: High
**Description**: 应用必须使用 `kkddytd/claude-api` 当前源码所要求的 Bearer 鉴权方式。

### FR-2: Token 导入优先
**Priority**: High
**Description**: 应用优先调用 `/v2/accounts/import-by-token`，并发送其支持的完整 IdC 导入格式。

### FR-3: Direct Import 回退
**Priority**: High
**Description**: 当 `/v2/accounts/import-by-token` 不可用时，应用回退到 `/v2/accounts/import`，使用账号导入格式完成兼容。

### FR-4: 结果可观测
**Priority**: Medium
**Description**: 导入结果需要反映实际使用的兼容策略，以及失败/跳过原因。

## 🔧 Non-Functional Requirements

### Reliability
- 网络错误、404、目录错误等异常需要转换为结构化结果
- 不因为导入失败影响本地账号池

### Maintainability
- 兼容逻辑集中在导入服务层
- 为关键格式转换与回退流程补回归测试

## 📐 Constraints

### Technical Constraints
- 目标仓库为 `kkddytd/claude-api`
- 现有前端和 IPC 结构尽量不改

## 🚫 Out of Scope

- `cliproxyapi` 集成调整
- 注册流程改为纯 API
- 远程自动探测 `claude-api` 更多非管理端行为

## 📊 Acceptance Criteria

- [ ] `kkddytd/claude-api` 当前接口可兼容
- [ ] 旧导入路径不可用时能自动回退
- [ ] 回归测试覆盖兼容路径
- [ ] 类型检查和构建通过

## 🔗 Related Documents

- [Technical Design](../design/20260325-claude-api-compatibility-technical-design.md)
- [Existing Kiro Integration Design](../design/20260325-kiro-register-capability-technical-design.md)

## 📝 Notes

- 本轮按用户要求，`cliproxyapi` 先不作为实现目标。
