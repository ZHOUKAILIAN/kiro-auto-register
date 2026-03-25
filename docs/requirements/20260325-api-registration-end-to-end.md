# Kiro 纯接口注册端到端交付 - Requirements Document

**Date**: 2026-03-25
**Status**: Approved
**Author**: Codex

## 📋 Overview

### Background
当前仓库已经具备以下能力：

- `Tempmail.lol` 临时邮箱创建与 OTP 轮询
- `x-amz-sso_authn` 到 Kiro 凭证的兑换
- 导入到 `kkddytd/claude-api`

但注册主链路此前仍依赖旧页面自动化方案，不符合用户最新要求。用户明确要求：

- 不走浏览器注册，只走接口
- 当前邮箱供应商优先使用 `tempmail.lol`
- 兼容 `kkddytd/claude-api`
- 最终交付必须完成真实端到端打通，而不是只停留在代码层

### Objectives
- 用纯 HTTP 接口替换旧注册方案，拿到可兑换的 `x-amz-sso_authn`
- 复用现有 `exchangeSsoToken` 和 `claude-api` 导入能力，串成完整链路
- 对代理、OTP、导入和最终请求验证提供可观测结果

## 👥 User Stories

### User Story 1: 纯接口注册 Kiro 账号
**As a** 使用者
**I want** 应用通过 AWS / Builder ID 接口完成注册
**So that** 我不需要依赖旧页面自动化或手动页面交互

**Acceptance Criteria**:
- [ ] 注册流程不启动浏览器
- [ ] 应用可通过 `tempmail.lol` 接收本次注册 OTP
- [ ] 注册成功后能够拿到 `x-amz-sso_authn`

### User Story 2: 自动导入到 kkddytd/claude-api
**As a** 使用者
**I want** 新注册的账号自动导入本地 `claude-api`
**So that** 我可以直接在下游池中使用账号

**Acceptance Criteria**:
- [ ] 兑换出的账号可调用 `importAccountsToClaudeApi`
- [ ] `Authorization: Bearer <admin>` 鉴权保持兼容
- [ ] 导入结果在日志和返回结构中可见

### User Story 3: 做真实请求验证
**As a** 使用者
**I want** 交付结果包含真实打通验证
**So that** 我收到的是可运行结果，而不是“理论可行”

**Acceptance Criteria**:
- [ ] 真实完成 `tempmail -> 注册 -> 凭证兑换 -> claude-api 导入`
- [ ] 对本地 `claude-api` 执行至少一次聊天请求验证
- [ ] 若外部平台限制导致某一步失败，输出明确阻塞点和证据

## 🎯 Functional Requirements

### FR-1: 纯接口注册服务
**Priority**: High
**Description**: 实现纯接口注册服务，负责 Builder ID / AWS 相关接口调用、状态推进、Cookie 管理和注册结果输出。

**Details**:
- Input: 代理配置、进度回调
- Processing: 创建注册上下文、触发 OTP、提交邮箱与姓名、完成身份创建、设置密码并建立会话
- Output: `RegisterResult`

**Edge Cases**:
- API 返回 workflow/state 无效
- OTP 过期或邮件延迟
- 下游步骤要求重试或返回临时错误

### FR-2: Tempmail OTP 集成
**Priority**: High
**Description**: 纯接口注册必须复用并兼容 `Tempmail.lol` 当前实现，保证 OTP 阶段可用。

### FR-3: 主流程切换
**Priority**: High
**Description**: Electron 主流程注册入口切换到纯接口实现，默认不再调用旧注册方式。

### FR-4: Claude API 自动导入
**Priority**: High
**Description**: 当配置启用自动导入时，新注册账号需要沿用现有兼容逻辑导入 `kkddytd/claude-api`。

### FR-5: 端到端验证能力
**Priority**: High
**Description**: 提供可执行验证脚本或内置方法，对本地 `claude-api` 的聊天接口发起真实请求验证。

### FR-6: 代理透传
**Priority**: Medium
**Description**: 注册、邮箱、导入和验证链路应支持当前环境代理或显式代理配置。

## 🔧 Non-Functional Requirements

### Reliability
- 关键步骤返回结构化错误
- 不因某个账号失败而破坏批量流程
- 对可重试的接口保留有限重试能力

### Security
- 不在日志中泄漏完整敏感凭证
- 密码、token 只在必要范围内保留

### Maintainability
- 把纯接口注册逻辑集中在服务层
- 为关键解析逻辑、状态推进逻辑和主流程切换补测试

## 📐 Constraints

### Technical Constraints
- 不允许用任何浏览器方式完成注册
- 保持 Electron + TypeScript 当前架构
- 下游 `exchangeSsoToken`、store、IPC、renderer 结构尽量少改

## 🚫 Out of Scope

- `cliproxyapi` 本轮优先级降低，可以保持现状
- 多邮箱供应商 UI
- 绕过平台风控或验证码系统

## 📊 Acceptance Criteria

- [ ] 新 requirement/design 文档落库
- [ ] 纯接口注册服务有自动化测试覆盖
- [ ] 主流程默认走纯接口注册
- [ ] 真实完成一条 `tempmail -> 注册 -> 导入 claude-api -> 测试请求` 链路，或明确给出外部阻塞证据
- [ ] 类型检查与相关测试通过

## 🔗 Related Documents

- [Technical Design](../design/20260325-api-registration-end-to-end-technical-design.md)
- [Tempmail Hardening](../design/20260325-tempmail-registration-hardening-technical-design.md)
- [Claude API Compatibility](../design/20260325-claude-api-compatibility-technical-design.md)

## 📝 Notes

- 本文档基于用户“不要走浏览器的方式，就走接口的方式”“最后尝试一下 tempmail.lol 注册邮箱，然后能导入到 claude-api，能打通请求”“我需要端到端的交付”直接采用并执行。

---

**Review History**:
- 2026-03-25: Initial approved draft based on explicit user direction
