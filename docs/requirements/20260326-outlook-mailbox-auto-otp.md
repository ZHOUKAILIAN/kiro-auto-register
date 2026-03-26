# Outlook 邮箱自动收码（导入 Graph 凭据）- Requirements Document

**Date**: 2026-03-26
**Status**: Approved
**Author**: Codex

## 📋 Overview

### Background
当前项目已经支持：

- `tempmail` 自动收码
- 自定义邮箱 + 手动 OTP
- `mailbox` 作为预留模式

但 `mailbox` 目前仍未落地，导致用户即使已经有可用的 Outlook 邮箱，也只能手动去邮箱里抄码，再回到界面提交验证码。参考仓库 `Kiro-auto-register` 中仍然有一部分可借鉴能力：通过 Microsoft Graph 读取 Outlook 邮件，并从最新 AWS 验证邮件中提取 6 位 OTP。

为了让“已有 Outlook 邮箱 -> 自动收码 -> 继续注册”真正可用，本轮需要把 `mailbox` 模式落地到当前 Electron 工作台中。

### Objectives
- 支持导入已授权的 Outlook Graph 凭据，用于自动收取 AWS/Kiro 验证码
- 在现有纯 API 注册链路中完成 `mailbox` OTP 模式接入
- 在 UI 和诊断中暴露 Outlook 自动收码状态与失败原因
- 复用并兼容现有手动 OTP、`tempmail` 与代理配置能力

## 👥 User Stories

### User Story 1: 我想用已有 Outlook 邮箱自动收码
**As a** 使用者
**I want** 配置我自己的 Outlook 邮箱凭据后，让系统自动拉取验证码
**So that** 我不需要每次手动去邮箱里抄码再继续注册

**Acceptance Criteria**:
- [ ] 自定义邮箱模式下可以选择 `mailbox` OTP 模式
- [ ] 用户可以保存 Outlook Graph 所需的 `client_id` 与 `refresh_token`
- [ ] 注册进入 OTP 阶段后，系统会自动轮询 Outlook 邮箱并继续注册

### User Story 2: 我想知道 Outlook 自动收码为什么失败
**As a** 使用者
**I want** 在日志和诊断里看到 Outlook 邮箱鉴权、拉取邮件和提取验证码的状态
**So that** 我能快速判断是 token 失效、邮件没到，还是正文没匹配到验证码

**Acceptance Criteria**:
- [ ] 注册日志会输出 Outlook token 刷新、邮件轮询和验证码提取信息
- [ ] 诊断入口会在适用时显示 Outlook 邮箱连通性摘要
- [ ] 失败信息不会只停留在“邮箱自动收码失败”这种模糊层级

### User Story 3: 我希望它不要和其他仓库耦合
**As a** 使用者
**I want** 这个项目内部就能完成 Outlook 自动收码，不依赖其他仓库的 UI 或运行时
**So that** 当前应用仍然保持导出接口独立、能力边界清晰

**Acceptance Criteria**:
- [ ] Outlook 自动收码能力仅以内置服务和设置字段接入
- [ ] 不引入 `claude-api` 等其他项目的显示或运行依赖
- [ ] 账号导出接口保持不变

## 🎯 Functional Requirements

### FR-1: Outlook Graph 凭据配置
**Priority**: High
**Description**: 应用需要允许用户保存 Outlook 自动收码所需的 Graph 凭据。

**Details**:
- Input: 自定义邮箱地址、Outlook Graph `client_id`、`refresh_token`
- Processing:
  - 在设置中新增 Outlook 凭据字段
  - 保存到本地 `electron-store`
  - 历史设置缺失字段时自动回填默认值
- Output: 可被注册流程和诊断流程复用的 Outlook 配置

**Edge Cases**:
- 缺少 `client_id`
- 缺少 `refresh_token`
- 邮箱地址为空或格式非法

### FR-2: `mailbox` OTP 模式落地
**Priority**: High
**Description**: 注册流程需要真正支持 `mailbox` 模式，而不是直接报“后续版本提供”。

**Details**:
- Input: `registrationEmailMode = custom`、`otpMode = mailbox`
- Processing:
  - 在 OTP 阶段调用 Outlook 邮箱 provider
  - 轮询最近邮件
  - 从命中的 AWS 邮件中提取 6 位验证码
- Output: 成功时自动继续 `create-identity`；失败时返回明确错误

**Edge Cases**:
- Token 刷新失败
- 邮件轮询超时
- 邮件到了但正文没匹配到验证码

### FR-3: Outlook 自动收码日志
**Priority**: High
**Description**: Outlook 自动收码的关键阶段必须写入进度日志。

**Details**:
- Input: Token 刷新结果、邮件轮询结果、邮件匹配结果
- Processing:
  - 输出 token 刷新尝试
  - 输出本轮获取到的邮件数量
  - 输出命中的发件人 / 主题 / 时间
  - 输出验证码是否提取成功
- Output: 用户可读且足够定位问题的日志

**Edge Cases**:
- 不在日志中完整暴露 `refresh_token`
- 不把验证码长期保存在运行态之外

### FR-4: Outlook 邮箱诊断
**Priority**: Medium
**Description**: 当用户配置了 Outlook 邮箱自动收码时，诊断入口应顺带检测邮箱连通性。

**Details**:
- Input: Outlook Graph 凭据
- Processing:
  - 最少完成一次 token 刷新与邮件列表读取
  - 返回结构化成功/失败结果
- Output: `mailbox` 诊断摘要

**Edge Cases**:
- 用户当前不是 `mailbox` 模式时，不强制执行 Outlook 诊断
- 缺字段时返回可理解的提示，而不是抛未捕获异常

## 🔧 Non-Functional Requirements

### Reliability
- Outlook 自动收码失败时不能导致主进程崩溃
- Token 轮换后如果服务端返回新的 `refresh_token`，应更新本地保存值

### Security
- `refresh_token` 只保存到本地设置，不上传到任何远端
- 日志中只允许掩码显示 token
- 验证码不应写入长期持久化存储

### Usability
- 用户应能在现有“控制台”里直接配置和使用 Outlook 自动收码
- 不要求用户切换到其他项目界面才能完成 Outlook OTP 配置

### Maintainability
- Outlook 自动收码逻辑需集中在独立服务文件
- `mailbox` OTP 模式应复用现有 OTP provider 扩展边界

## 📐 Constraints

### Technical Constraints
- 继续保持当前纯 HTTP / API 注册主链路
- 本轮优先实现“导入 Outlook Graph 凭据后自动收码”
- 本轮不实现完整的 Outlook OAuth 授权向导或 Outlook 账号注册

### Business Constraints
- 当前项目以学习 / 研究为目的，功能需要尽量可验证、可维护
- 本轮要保证现有 `tempmail`、手动 OTP、导出链路不回退

## 🚫 Out of Scope

- 自动注册 Outlook 邮箱账号
- 通用 IMAP/POP3 邮箱市场支持
- 完整的 Microsoft OAuth 应用注册向导
- 把 Outlook 自动收码逻辑耦合到其他仓库或下游系统

## 📊 Acceptance Criteria

- [ ] 自定义邮箱模式支持 `mailbox` OTP 选项
- [ ] Outlook Graph 凭据可保存、可复用
- [ ] 注册流程可自动从 Outlook 邮箱提取验证码并继续注册
- [ ] Outlook 相关失败日志和诊断摘要可见
- [ ] 相关测试、`typecheck`、`build` 通过

## 🔗 Related Documents

- [Registration Fallback OTP Requirement](../requirements/20260325-registration-fallback-otp.md)
- [Technical Design](../design/20260326-outlook-mailbox-auto-otp-technical-design.md)

## 📝 Notes

- 本需求按用户直接授权“做吧”进入实现。
- 本轮借鉴参考仓库中仍有价值的 Outlook Graph 收码与验证码提取思路，但不会复用其旧的整仓 UI 和注册流程。

---

**Review History**:
- 2026-03-26: Initial draft created by Codex
- 2026-03-26: Approved for direct implementation under user authorization
