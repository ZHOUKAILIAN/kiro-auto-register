# Tempmail.lol 注册流程加固 - Requirements Document

**Date**: 2026-03-25
**Status**: Approved
**Author**: Codex

## 📋 Overview

### Background
当前 Kiro 注册流程已经可以通过 `Tempmail.lol` 创建邮箱并轮询验证码，但实现仍偏基础：

- OTP 拉取没有时间锚点，历史邮件可能污染当前验证码
- 邮件时间字段兼容性有限
- 邮箱创建与收件箱读取缺少面向供应商波动的重试与明确错误归因
- 整体流程没有吸收 `cnlimiter/codex-manager` 在临时邮箱与 OTP 阶段的稳态经验

### Objectives
- 借鉴 `cnlimiter/codex-manager` 的可复用注册思路，增强 Tempmail.lol + OTP 可靠性
- 保持现有 Kiro 注册主链路稳定
- 为后续扩展更多邮箱供应商保留清晰边界

## 👥 User Stories

### User Story 1: 使用 Tempmail.lol 更稳定拿到验证码
**As a** 使用者
**I want** 系统只消费本次注册之后到达的验证码邮件
**So that** 历史邮件或延迟邮件不会把注册流程带偏

**Acceptance Criteria**:
- [ ] 系统在发送/触发 OTP 后记录时间锚点
- [ ] 邮件轮询会忽略明显早于锚点的历史邮件
- [ ] 兼容 `received_at`、`date`、`created_at` 等常见时间字段

### User Story 2: Tempmail 波动时流程更稳
**As a** 使用者
**I want** Tempmail 接口抖动时流程能自动重试
**So that** 单次 429 或短暂网络异常不会直接导致整次注册失败

**Acceptance Criteria**:
- [ ] 创建邮箱会对暂时性错误进行有限重试
- [ ] 收件箱拉取异常时会继续在超时预算内重试
- [ ] 失败日志能体现阶段与原因

## 🎯 Functional Requirements

### FR-1: OTP 时间锚点过滤
**Priority**: High
**Description**: 在等待验证码时，只使用晚于当前 OTP 发送锚点的邮件。

### FR-2: Tempmail 时间字段兼容
**Priority**: High
**Description**: 兼容 Unix 时间戳、毫秒时间戳和 ISO 8601 时间字符串。

### FR-3: 创建邮箱重试
**Priority**: High
**Description**: 对 Tempmail 创建邮箱阶段添加有限重试和退避。

### FR-4: 收件箱轮询容错
**Priority**: Medium
**Description**: 收件箱读取异常时，不立即终止，而是在总超时预算内继续轮询。

## 🔧 Non-Functional Requirements

### Reliability
- 对 Tempmail 的短暂异常具备容错能力
- 不因旧邮件误匹配导致验证码阶段误判成功

### Maintainability
- 为时间解析、OTP 锚点和创建邮箱重试补充可重复的单元测试

## 📐 Constraints

### Technical Constraints
- 保持现有 Electron + TypeScript 架构
- 不迁移到 `codex-manager` 的 OpenAI 专属协议和 Python 实现

## 🚫 Out of Scope

- 替换 Kiro 注册协议
- 一次性接入多邮箱供应商 UI
- 大规模重构为任务编排引擎

## 📊 Acceptance Criteria

- [ ] OTP 时间锚点过滤生效
- [ ] Tempmail 时间字段兼容测试通过
- [ ] 创建邮箱重试测试通过
- [ ] 类型检查与构建通过

## 🔗 Related Documents

- [Technical Design](../design/20260325-tempmail-registration-hardening-technical-design.md)
- [Current Kiro Register Capability](../requirements/20260325-kiro-register-capability.md)

## 📝 Notes

- 本文档基于用户“现在邮箱暂时是尝试 tempmail.lol，借鉴 codex-manager 注册方式”的要求拟定并直接推进。
