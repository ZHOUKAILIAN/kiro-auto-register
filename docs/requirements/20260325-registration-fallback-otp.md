# 注册回退能力（手动 OTP 优先，自带邮箱扩展）- Requirements Document

**Date**: 2026-03-25
**Status**: Approved
**Author**: Codex

## 📋 Overview

### Background
当前仓库的纯接口注册链路、凭证兑换、`claude-api` 导入与探针验证都已经具备，但真实注册仍被外部条件卡住：

- `tempmail.lol` 在部分出口环境会受地域限制
- 即便切到可创建 `tempmail` 邮箱的海外出口，AWS 仍可能在 `profile /send-otp` 阶段触发 `TES BLOCKED`
- 当前应用只支持自动收取 `tempmail` 验证码，不支持用户自己接管 OTP 输入，也没有把“代理是否可用、邮箱是否可用、AWS 卡在哪一层”直观展示出来

为了让真实链路继续推进，应用需要提供注册回退能力：先支持用户在界面中手动输入 OTP，并补上代理/链路诊断；后续在同一套流程上扩展用户自带邮箱自动收码。

### Objectives
- 提供手动 OTP 输入能力，让注册流程不再被单一临时邮箱策略卡死
- 保留纯接口注册主链路，不引入浏览器注册回退
- 提供代理与注册链路诊断，快速判断出口 IP、`tempmail` 和 AWS 阶段阻塞点
- 为后续接入用户自带邮箱的 IMAP/POP3 自动收码保留扩展位

## 👥 User Stories

### User Story 1: 在界面里手动输入验证码继续注册
**As a** 使用者
**I want** 当系统无法自动拿到 OTP 时，在界面里手动输入验证码
**So that** 我可以用自己的邮箱或其他方式拿码，继续推进真实注册

**Acceptance Criteria**:
- [x] 当注册进入 OTP 阶段时，界面能提示当前账号正在等待验证码
- [x] 用户可以在界面中输入 6 位 OTP 并继续当前注册任务
- [x] OTP 提交成功或失败后，界面会显示明确结果和下一步状态

### User Story 2: 先看清链路卡在哪一层
**As a** 使用者
**I want** 在应用里直接看到代理出口、`tempmail` 可用性和 AWS 阶段诊断结果
**So that** 我不用每次都手工跑脚本判断是代理、邮箱还是 AWS 风控问题

**Acceptance Criteria**:
- [x] 应用可以显示当前代理出口 IP 和地理信息
- [x] 应用可以测试 `tempmail.lol` 创建邮箱是否成功
- [x] 应用可以显示 AWS 注册当前失败阶段和响应摘要

### User Story 3: 后续切到自带邮箱自动收码
**As a** 使用者
**I want** 后续可以配置自己的邮箱用于自动轮询验证码
**So that** 我在不依赖 `tempmail` 的情况下也能自动化推进注册

**Acceptance Criteria**:
- [x] 本次实现会为“自带邮箱自动收码”保留清晰的模式入口和配置结构
- [x] 需求与设计文档明确 IMAP/POP3 扩展方向
- [x] 当前版本不会因尚未完成 IMAP/POP3 自动收码而阻塞手动 OTP 方案上线

## 🎯 Functional Requirements

### FR-1: OTP 获取模式
**Priority**: High
**Description**: 注册流程必须支持不止一种 OTP 获取方式，并在 UI 中明确展示当前模式。

**Details**:
- Input: 用户设置中的 OTP 模式
- Processing:
  - 默认仍可使用现有 `tempmail` 自动轮询
  - 新增手动 OTP 模式
  - 为后续“自带邮箱自动收码”预留模式与配置结构
- Output: 注册任务按所选模式进入对应 OTP 流程

**Edge Cases**:
- 用户未选择模式时应有默认值
- 当前模式不可用时应给出明确原因

### FR-2: 手动 OTP 断点与恢复
**Priority**: High
**Description**: 当注册进入验证码阶段时，应用需要暂停在可恢复状态，等待用户输入 OTP 再继续。

**Details**:
- Input: 当前注册上下文、OTP、代理配置
- Processing:
  - 保存继续注册所需的最小上下文
  - 在 UI 中暴露“等待输入验证码”的任务状态
  - 用户提交 OTP 后继续执行身份创建与后续链路
- Output: 成功时继续注册；失败时返回明确错误

**Edge Cases**:
- OTP 为空、长度错误或格式非法
- OTP 过期或被服务端拒绝
- 用户长时间未输入导致注册上下文失效

### FR-3: 链路诊断入口
**Priority**: High
**Description**: 应用需要提供一个可重复执行的链路诊断能力，用于判断当前环境是否适合继续注册。

**Details**:
- Input: 代理 URL、当前设置
- Processing:
  - 查询当前出口 IP 和地理信息
  - 测试 `tempmail.lol` 创建邮箱
  - 输出 AWS 注册失败阶段或最近一次阻塞原因
- Output: 结构化诊断结果和日志面板输出

**Edge Cases**:
- 代理不可达
- IP 查询接口超时
- `tempmail` 成功但 AWS 仍被风控拦截

### FR-4: 注册日志与状态增强
**Priority**: High
**Description**: 为了支撑手动 OTP 流程，任务状态与日志需要比当前更精细。

**Details**:
- Input: 注册进度事件
- Processing:
  - 为“等待 OTP 输入”“OTP 提交中”“OTP 校验失败”“继续兑换凭证”等阶段增加状态
  - 在 UI 中显式展示当前任务是否可继续
- Output: 用户可读的任务状态与日志

**Edge Cases**:
- 同时存在多个注册任务等待 OTP
- 用户误将一个 OTP 提交给了错误任务

### FR-5: 自带邮箱扩展位
**Priority**: Medium
**Description**: 当前版本不必完成 IMAP/POP3 自动收码，但必须为下一阶段保留稳定接口。

**Details**:
- Input: 邮箱配置草案
- Processing:
  - 在设置结构中预留邮箱模式、服务器、端口、用户名等字段
  - 在服务层抽象 OTP provider 接口，避免后续推翻手动 OTP 实现
- Output: 可扩展的数据结构与服务边界

**Edge Cases**:
- 历史设置缺少新增字段
- 用户切换模式后旧配置应被安全忽略

## 🔧 Non-Functional Requirements

### Reliability
- 手动 OTP 断点恢复不能依赖渲染进程内存，应用刷新或窗口重载后仍应能恢复可继续状态
- 诊断入口失败时返回结构化错误，避免只留模糊日志

### Security
- 代理账号、邮箱凭证和 OTP 不应在日志中完整明文输出
- 自带邮箱配置需要沿用现有本地设置保存方式，不额外引入远程存储

### Usability
- 用户应在一个主界面内完成“启动注册 -> 查看阻塞 -> 输入 OTP -> 继续执行”
- 手动 OTP 的交互应尽量短路径，不要求用户打开开发者工具或运行外部脚本

### Maintainability
- OTP 获取方式应通过服务层抽象隔离，避免把逻辑散落在主进程和 UI 里
- 诊断能力应能被后续真实联调与回归复用

## 📐 Constraints

### Technical Constraints
- 继续保持纯接口注册主链路，不引入浏览器注册 fallback
- 桌面应用仍基于 Electron + React + TypeScript + `electron-store`
- 当前真实外部链路受 AWS 风控影响，新功能重点是增强可恢复性和可观测性

### Business Constraints
- 本轮需要先交付可用的手动 OTP 方案，再考虑自动收码扩展
- 不做超出注册链路所需的大规模架构重写

## 🚫 Out of Scope

- 本轮不实现完整 IMAP/POP3 自动收码
- 本轮不接入 SMTP 发信、OAuth 邮箱登录或多邮箱服务商模板市场
- 本轮不尝试规避 AWS 风控策略本身

## 📊 Acceptance Criteria

- [x] 用户可以在界面中手动输入 OTP 并继续当前注册任务
- [x] 应用可以展示当前代理出口、`tempmail` 可用性和最近一次 AWS 阻塞摘要
- [x] 注册任务状态能覆盖“等待 OTP 输入”等关键断点
- [x] 设置与任务上下文对新增字段保持兼容
- [x] requirement/design 文档更新到位
- [x] 相关测试通过

## 🔗 Related Documents

- [API Registration E2E Requirement](../requirements/20260325-api-registration-end-to-end.md)
- [Technical Design](../design/20260325-registration-fallback-otp-technical-design.md)

## 📝 Notes

- 本需求采用两阶段策略：
  - Phase 1: 手动 OTP + 代理/链路诊断
  - Phase 2: 自带邮箱 IMAP/POP3 自动收码
- 当前文档先用于确认需求边界，设计文档会在需求确认后补充实现细节。

---

**Review History**:
- 2026-03-25: Initial draft created by Codex
- 2026-03-25: Approved for implementation and shipped with manual OTP + diagnostics scope
