# 注册过程强可观测性增强 - Requirements Document

**Date**: 2026-03-25
**Status**: Approved
**Author**: Codex

## 📋 Overview

### Background
当前应用已经具备注册日志面板，但用户实际联调时仍然觉得信息不够：

- 点击“开始注册”后，日志前几行过于概括，缺少底层阶段和失败细节
- 某些失败只显示 HTTP 状态码，没有把响应体或上下文暴露出来
- 虽然系统内部已经能够拿到验证码，但 UI 没有把“当前验证码是多少、是自动拿到还是手动提交的”完整暴露出来

用户明确要求把失败日志、验证码细节和阶段过程尽可能直接地展示在当前应用中，便于本地联调排障。

### Objectives
- 在日志面板中显示更完整的注册阶段信息
- 将可获取的失败响应摘要直接暴露给用户
- 在本地 UI 日志里显式展示自动获取或手动提交的 OTP 码值
- 保持实现聚焦本地可观测性，不引入远程日志系统

## 👥 User Stories

### User Story 1: 我想知道失败到底卡在哪
**As a** 使用者
**I want** 在日志里看到每个关键阶段、失败阶段和失败明细
**So that** 我不用只凭一个状态码猜问题

**Acceptance Criteria**:
- [ ] 创建邮箱失败时，日志里包含 HTTP 状态和响应摘要
- [ ] 注册链路失败时，日志里包含明确阶段名
- [ ] 渲染层最终摘要不再吞掉第一条关键失败原因

### User Story 2: 我想直接看到验证码内容
**As a** 使用者
**I want** 在本地 UI 中看到自动获取或手动提交的验证码
**So that** 我能确认系统到底拿到了什么码、提交了什么码

**Acceptance Criteria**:
- [ ] 自动轮询拿到 OTP 后，日志中显示实际 6 位验证码
- [ ] 手动提交 OTP 后，日志中显示提交的 6 位验证码
- [ ] OTP 的展示只发生在本地 UI 日志范围内

### User Story 3: 我想看到重试与轮询过程
**As a** 使用者
**I want** 在日志里看到 Tempmail 创建重试、收件箱轮询、邮件匹配等过程
**So that** 我知道系统不是卡住，而是在执行哪一步

**Acceptance Criteria**:
- [ ] Tempmail 创建邮箱的尝试次数会记录到日志
- [ ] 收件箱轮询会显示轮询次数、邮件数量或匹配状态
- [ ] 识别到 AWS 邮件时能显示发件人/主题等关键上下文

## 🎯 Functional Requirements

### FR-1: 详细阶段日志
**Priority**: High
**Description**: 注册链路必须输出比当前更细的阶段化日志，包括开始、成功、跳过、重试和失败。

### FR-2: 失败响应明细
**Priority**: High
**Description**: 对 HTTP 非 2xx 的外部调用，应尽量把响应体摘要带入错误与日志，而不是只保留状态码。

### FR-3: OTP 明文暴露（本地 UI）
**Priority**: High
**Description**: 基于用户明确要求，本地 UI 日志允许直接显示本次自动获取或手动提交的 OTP 码值。

### FR-4: 日志首屏反馈
**Priority**: Medium
**Description**: 点击注册后，界面需要立即显示启动信息与当前策略，不应让用户长时间看到空白日志。

## 🔧 Non-Functional Requirements

### Usability
- 日志应该以人类可读文本输出，不要求用户解析 JSON
- 失败信息应优先展示最关键的阶段、状态码和响应摘要

### Safety
- 仅在本地应用 UI 内显示 OTP，不新增外发或远程同步
- 不在日志中完整回显长 token、密钥等其他高敏凭证

## 🚫 Out of Scope

- 引入远程日志平台
- 新增网络抓包面板
- 展示完整 access token / refresh token 明文

## 📊 Acceptance Criteria

- [ ] Tempmail 创建失败时，日志能显示状态码与响应摘要
- [ ] OTP 获取和提交时，日志能显示实际验证码
- [ ] 点击注册后，日志首屏信息更完整
- [ ] 相关测试、类型检查和构建通过

## 🔗 Related Documents

- [Technical Design](../design/20260325-registration-verbose-observability-technical-design.md)
- [Registration Fallback Requirement](../requirements/20260325-registration-fallback-otp.md)

## 📝 Notes

- 本文档基于用户“失败的日志等都要暴露出来，然后在获取验证码，验证码是多少等等，也要暴露出来”的直接指令创建，并按用户授权自动批准执行。
