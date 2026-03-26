# MoeMail API 邮箱 Provider 接入 - Requirements Document

**Date**: 2026-03-26
**Status**: Approved
**Author**: Codex

## 📋 Overview

### Background
当前项目已经具备三条邮件相关能力：

- `tempmail.lol` 自动创建邮箱并自动轮询验证码
- 自定义邮箱 + 手动 OTP
- 自定义 Outlook 邮箱 + Graph 自动收码

但在真实环境里，`tempmail.lol` 与当前出口 / AWS TES 风控组合并不总是稳定。与此同时，`MoeMail` 已具备可编程 OpenAPI、临时邮箱创建和邮件读取能力，适合作为新的“自动邮箱提供方”接入当前工作台。

本轮调研已经确认：

- `MoeMail` 线上站点支持注册与登录
- 注册 / 用户名密码登录需要 Cloudflare Turnstile 校验
- OpenAPI 访问依赖登录后的 API Key
- 线上匿名直接创建邮箱不可用，不是无状态匿名 tempmail

因此，本轮目标不是“自动注册 MoeMail 站点账号”，而是把“已拥有 MoeMail 账号 + API Key”接入当前项目，作为新的自动建箱 / 自动收码选项。

### Objectives
- 支持使用 MoeMail OpenAPI 自动创建注册邮箱
- 支持从 MoeMail 邮箱中自动轮询并提取 AWS/Kiro 6 位 OTP
- 在 UI、日志、诊断中暴露 MoeMail 配置与失败原因
- 保证现有 `tempmail`、Outlook、手动 OTP、导出能力不回退

## 👥 User Stories

### User Story 1: 我想把 MoeMail 当成新的自动邮箱来源
**As a** 使用者
**I want** 在当前应用里配置 MoeMail API Key 后，直接让系统自动创建邮箱并收取验证码
**So that** 我不需要跳到其他工具里手工创建邮箱和抄验证码

**Acceptance Criteria**:
- [ ] 自动邮箱模式下可选择 `MoeMail API`
- [ ] 我可以配置 `base URL`、`API Key` 和优选域名
- [ ] 注册流程会自动创建 MoeMail 邮箱并继续发送 OTP
- [ ] OTP 阶段会自动轮询 MoeMail 邮件并继续注册

### User Story 2: 我想快速知道 MoeMail 为什么不可用
**As a** 使用者
**I want** 在日志和诊断里看到 MoeMail 的建箱、拉信、验证码提取失败原因
**So that** 我能区分是 API Key 无效、权限不足、域名配置错误，还是邮件根本没到

**Acceptance Criteria**:
- [ ] 日志会输出 MoeMail 配置校验、建箱、轮询邮件、验证码提取过程
- [ ] 诊断面板会显示 MoeMail provider 摘要
- [ ] 失败信息不会只停留在“创建邮箱失败”这类模糊层级

### User Story 3: 我希望项目边界保持清晰
**As a** 使用者
**I want** 这个项目只接 MoeMail 的导出 / API 能力，而不是耦合 MoeMail 站点注册实现
**So that** 当前仓库仍保持学习 / 研究用途下的清晰边界

**Acceptance Criteria**:
- [ ] 不在当前项目里实现 MoeMail 站点账号自动注册
- [ ] 不尝试绕过 Turnstile 或依赖第三方解码服务
- [ ] 仅接入账号已具备后的 API Key 能力

## 🎯 Functional Requirements

### FR-1: 自动邮箱提供方选择
**Priority**: High
**Description**: 自动邮箱模式需要支持多个 provider，而不再只绑定 `tempmail.lol`。

**Details**:
- Input: 自动邮箱模式下的 provider 选择
- Processing:
  - 在设置中新增自动邮箱 provider 字段
  - 默认保持 `tempmail.lol`
  - 当用户切换到 `MoeMail API` 时，注册与诊断流程都走 MoeMail
- Output: 被注册主流程和诊断流程复用的 provider 配置

**Edge Cases**:
- 未选择 provider 时回退默认值
- 老设置缺失字段时自动补默认值

### FR-2: MoeMail 配置管理
**Priority**: High
**Description**: 应用需要允许用户保存 MoeMail OpenAPI 所需凭据。

**Details**:
- Input: `moemailBaseUrl`、`moemailApiKey`、`moemailPreferredDomain`
- Processing:
  - 保存到本地 `electron-store`
  - 在日志中掩码显示 API Key
  - 若域名为空，则由服务端配置自动选择第一个可用域名
- Output: 可被建箱、拉信和诊断复用的 MoeMail 配置

**Edge Cases**:
- API Key 为空
- Base URL 非法
- 域名不在服务端允许列表里

### FR-3: MoeMail 自动建箱与自动收码
**Priority**: High
**Description**: 注册流程需要能够通过 MoeMail 完成邮箱创建与 OTP 自动提取。

**Details**:
- Input: `registrationEmailMode = tempmail` 且 `managedEmailProvider = moemail-api`
- Processing:
  - 读取 `/api/config` 获取域名
  - 调用 `/api/emails/generate` 创建邮箱
  - 调用 `/api/emails/{emailId}` / `/api/emails/{emailId}/{messageId}` 轮询新邮件
  - 提取 AWS 6 位验证码
- Output: 成功时继续 `create-identity`；失败时返回明确错误

**Edge Cases**:
- API Key 无效或无权限
- 账号角色没有 OpenAPI / 建箱权限
- 邮件达到但正文未匹配到 OTP

### FR-4: MoeMail 诊断与可观测性
**Priority**: Medium
**Description**: 当用户选择 MoeMail 作为自动邮箱 provider 时，诊断入口需要返回可操作摘要。

**Details**:
- Input: MoeMail provider 配置
- Processing:
  - 验证 `/api/config`
  - 最小化执行一次邮箱创建能力探测
  - 返回 provider 名称、成功状态、摘要消息
- Output: `managedEmail` 诊断结果

**Edge Cases**:
- Base URL 正常但 API Key 失效
- API Key 有效但当前角色无法建箱
- 诊断失败时不影响主进程稳定性

## 🔧 Non-Functional Requirements

### Reliability
- MoeMail provider 失败时不能导致主进程崩溃
- 失败时必须返回可读错误信息而不是未捕获异常

### Security
- API Key 仅保存在本地设置
- UI / 日志只显示掩码后的 API Key
- 不实现任何 Turnstile 绕过或站点注册破解流程

### Usability
- 用户应能直接在现有控制台里完成 MoeMail 配置
- provider 切换不应破坏现有 tempmail / Outlook 使用方式

### Maintainability
- MoeMail 逻辑应集中在独立服务文件
- 自动邮箱 provider 的分支应尽量集中，不把大量 provider 细节散落到 UI / 主流程

## 📐 Constraints

### Technical Constraints
- 继续保持当前纯 HTTP / API 注册主链路
- MoeMail 接入仅基于公开 OpenAPI 与用户自有 API Key
- 本轮不实现 MoeMail 账号注册、OAuth 登录自动化、Turnstile 自动求解

### Business Constraints
- 当前项目以学习 / 研究为目的
- 本轮必须保持现有导出接口与账号结构兼容

## 🚫 Out of Scope

- 自动注册 MoeMail 站点账号
- 自动获取或刷取 MoeMail API Key
- 使用第三方打码服务绕过 Turnstile
- 把 MoeMail 的用户管理 / 角色管理界面嵌入当前项目

## 📊 Acceptance Criteria

- [ ] 自动邮箱模式支持选择 `MoeMail API`
- [ ] MoeMail 配置可保存、可复用
- [ ] 注册流程可自动创建 MoeMail 邮箱并自动提取验证码
- [ ] 日志和诊断能显示 MoeMail provider 摘要
- [ ] 现有 `tempmail`、Outlook、手动 OTP 路径不回退
- [ ] 相关测试、`typecheck`、`build` 通过

## 🔗 Related Documents

- [Technical Design](../design/20260326-moemail-api-mailbox-provider-technical-design.md)
- [Outlook Mailbox Requirement](../requirements/20260326-outlook-mailbox-auto-otp.md)

## 📝 Notes

- 本需求按用户“继续”“最后只需要一个产物”的直接授权进入实现。
- 当前实现会以线上真实行为为准，而不是只信任 MoeMail README；已验证线上 `/api/config` 现状为需鉴权访问。

---

**Review History**:
- 2026-03-26: Initial draft created by Codex
- 2026-03-26: Approved for direct implementation under user authorization
