# IPFoxy 代理同步与 SOCKS5 支持 - Requirements Document

**Date**: 2026-03-26
**Status**: Approved
**Author**: Codex

## 📋 Overview

### Background
当前工作台的代理入口只有一个 `代理 URL` 文本框，底层实现基于 `undici ProxyAgent`，实质上只稳定支持 `http/https` 代理。

用户本轮提供的是 IPFoxy 的代理密钥与用户 ID。实测发现：

- IPFoxy 官方代理列表接口可通过 `api-id + api-token` 拉取
- 该账号当前返回的是 `socks5` 代理
- 现有应用不能直接消费 `socks5` 代理

这导致用户虽然已经具备可授权的代理资源，但当前产物仍需要手工桥接，无法直接复用。

### Objectives
- 保留现有单一 `代理 URL` 设置入口
- 让注册与诊断主流程支持 `socks5://` 代理
- 支持通过 `ipfoxy://<userId>:<proxyKey>` 自动同步并选择 IPFoxy 代理
- 保持实现与其他仓库解耦，只在本仓库内部提供导出的服务接口

## 👥 User Stories

### User Story 1: 我想直接用 SOCKS5 代理
**As a** 使用者
**I want** 在现有代理输入框中直接填写 `socks5://user:pass@host:port`
**So that** 我不需要自己额外起桥接工具

**Acceptance Criteria**:
- [ ] 当代理 URL 为 `socks5://` 时，注册流程可正常发起网络请求
- [ ] 当代理 URL 为 `socks5://` 时，诊断流程可正常发起网络请求
- [ ] SOCKS5 失败时，错误日志中保留底层原因

### User Story 2: 我想直接用 IPFoxy 的代理密钥
**As a** 使用者
**I want** 在现有代理输入框中填写 `ipfoxy://<userId>:<proxyKey>`
**So that** 系统能自动同步代理列表并挑选可用代理

**Acceptance Criteria**:
- [ ] 系统能通过 `api-id` 和 `api-token` 调用 IPFoxy 官方列表接口
- [ ] 当 IPFoxy 返回 `socks5` 代理时，系统能继续消费该代理
- [ ] 当 IPFoxy 返回空列表或接口失败时，日志中能显示明确原因

### User Story 3: 我不想让 UI 变复杂
**As a** 使用者
**I want** 继续使用现有单一代理输入入口
**So that** 不需要学习新的设置面板

**Acceptance Criteria**:
- [ ] 不新增单独的 IPFoxy 专用设置页
- [ ] `代理 URL` 输入框文案能提示支持的协议/格式

## 🎯 Functional Requirements

### FR-1: 统一代理入口
**Priority**: High
**Description**: `proxyUrl` 设置字段继续作为唯一代理入口，同时支持 `http://`、`https://`、`socks5://` 与 `ipfoxy://`。

### FR-2: IPFoxy 同步接口
**Priority**: High
**Description**: 新增本仓库内部服务接口，从 IPFoxy 官方 API 拉取代理列表，并输出标准化代理记录。

### FR-3: SOCKS5 运行时支持
**Priority**: High
**Description**: 当解析结果为 SOCKS5 代理时，运行时必须自动适配为当前注册链路可用的网络出口。

### FR-4: 失败透明化
**Priority**: High
**Description**: 代理同步失败、SOCKS5 握手失败、代理为空等错误都必须通过现有日志和诊断机制暴露。

## 🔧 Non-Functional Requirements

### Compatibility
- 不破坏现有 `http/https` 代理行为
- 不影响无代理时的系统网络直连模式

### Security
- 不在普通日志中完整回显 IPFoxy 密钥
- 不把代理密钥导出到账号导出产物中

### Maintainability
- IPFoxy 逻辑与 SOCKS5 逻辑放在独立服务模块中
- 对外保持可复用的服务函数，而不是散落在 UI 里

## 🚫 Out of Scope

- 支持多个 IPFoxy 账号轮询
- 新建复杂代理管理 UI
- 保证任意代理都能穿过 AWS 风控

## 📊 Acceptance Criteria

- [ ] `socks5://` 代理可用于诊断和注册链路
- [ ] `ipfoxy://<userId>:<proxyKey>` 可自动拉取代理并用于诊断和注册链路
- [ ] 失败日志包含明确阶段和底层原因
- [ ] 相关测试、类型检查和构建通过

## 🔗 Related Documents

- [Technical Design](../design/20260326-ipfoxy-socks5-proxy-support-technical-design.md)
- [Export-only Workbench Requirement](../requirements/20260325-export-only-workbench.md)

## 📝 Notes

- 本文档基于用户直接提供 IPFoxy 代理密钥与“自动同步代理列表”能力的输入创建，并按用户“不要问我，端到端实现”的授权自动批准执行。
