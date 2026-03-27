# 代理可用性诊断增强 - Requirements Document

**Date**: 2026-03-27
**Status**: Implemented
**Author**: Codex

## 📋 Overview

### Background
当前工作台已经支持“运行诊断”，但它主要回答的是：

- 当前代理出口在哪
- 临时邮箱是否能创建
- Outlook / MoeMail 是否能连通

它还不能直接回答用户最关心的问题：`这个代理到底能不能拿来注册 Kiro / AWS Builder ID？`

本轮联调里已经多次出现以下情况：

- 某个代理确实能出美国，但注册在 `send-otp` 被 `TES BLOCKED`
- 某个代理能创建邮箱，但在 `prepare-profile-workflow` 就因为 socket / TLS 问题失败
- 某个代理浏览器能打开页面，但 `profile.aws.com` 渲染极不稳定

用户希望把这层能力直接做进当前项目：输入一个代理后，不只是看“能联网”，而是能一眼看出它会卡在哪个注册阶段，是否属于 TES 风控问题。

### Objectives
- 在现有“运行诊断”入口中增加代理注册可用性探测
- 诊断结果明确暴露“成功到达的注册阶段”和“失败原因”
- 对 `TES BLOCKED`、网络中断、邮箱创建失败等情况给出清晰结论
- 保持实现聚焦当前仓库，不耦合外部项目或新增复杂设置页

## 👥 User Stories

### User Story 1: 我想知道代理是不是能真正用来注册
**As a** 使用者
**I want** 诊断不仅检查出口和邮箱，还直接探测注册链路
**So that** 我不用手动点“开始注册”再猜这个 IP 行不行

**Acceptance Criteria**:
- [x] 运行诊断时会探测纯接口注册链路
- [x] 诊断结果会显示当前代理最多推进到哪个阶段
- [x] 若被 AWS 风控拦截，结果会明确标记为 `TES BLOCKED` 或等价结论
 

### User Story 2: 我想区分“代理不通”和“代理被风控”
**As a** 使用者
**I want** 诊断结果区分网络连通失败与 AWS 风控拦截
**So that** 我知道该换代理类型、换节点，还是继续排查代码

**Acceptance Criteria**:
- [x] 网络层错误会保留底层原因，例如 `ECONNRESET`、`UND_ERR_SOCKET`
- [x] AWS 返回的阶段和响应体摘要会保留到诊断结果
- [x] UI 中能区分“网络失败”和“TES 风控阻塞”

### User Story 3: 我想继续使用现有工作台入口
**As a** 使用者
**I want** 仍然用现在的“运行诊断”按钮
**So that** 不需要学习新的面板或额外脚本

**Acceptance Criteria**:
- [x] 不新增独立的代理诊断页面
- [x] 现有链路诊断卡片直接展示代理注册探测结论
- [x] 诊断完成后的 flash / 摘要信息包含本次代理注册结论

## 🎯 Functional Requirements

### FR-1: 增加代理注册探针
**Priority**: High
**Description**: 诊断流程必须在出口与邮箱检查之后，继续尝试执行纯接口注册链路的最小闭环探针。

**Details**:
- Input: 当前设置中的 `proxyUrl` 与可用邮箱
- Processing: 依次尝试 `prepare-profile-workflow`、`start-profile-signup`、`send-otp`
- Output: 返回本次探针的阶段、结论、失败信息、是否命中 TES

**Edge Cases**:
- Case 1: 没有代理时，应允许直连模式下进行同样探针
- Case 2: 邮箱创建失败时，不应继续探测后续注册阶段

### FR-2: 结构化暴露注册探针结果
**Priority**: High
**Description**: 诊断结果结构中必须新增可被 renderer 直接消费的注册探针结果。

**Details**:
- Input: 注册探针执行结果
- Processing: 归一化为 `success / stage / message / email / classification`
- Output: 供 IPC、runtime state、renderer 统一使用

**Edge Cases**:
- Case 1: 探针成功发送 OTP 时，应明确标记为“可推进到 send-otp”
- Case 2: 探针异常抛错时，应保留底层 error chain 文本

### FR-3: UI 展示代理可用性结论
**Priority**: High
**Description**: Renderer 必须把代理注册探针的结果直接展示在链路诊断区域。

**Details**:
- Input: `latestDiagnostics.registrationProbe`
- Processing: 渲染状态文案、阶段和说明
- Output: 用户可读的“可用 / 被 TES 拦截 / 网络失败 / 待检测”结论

**Edge Cases**:
- Case 1: 未运行诊断时显示“待检测”
- Case 2: 仅邮箱失败时显示“未进入注册探测”，避免误判为 TES

### FR-4: 诊断摘要要能直接指导换 IP
**Priority**: Medium
**Description**: 诊断完成后的摘要信息必须尽量直接反映当前代理是否值得继续使用。

**Details**:
- Input: 诊断整体结果
- Processing: 组合出口、邮箱、注册探针的核心结论
- Output: flash message 和状态卡摘要

## 🔧 Non-Functional Requirements

### Performance
- 单次诊断允许比当前更长，但应尽量控制在 30 秒内完成
- 不在诊断中执行完整账号创建和凭证兑换

### Reliability
- 诊断失败不应污染正常注册流程状态
- 每次诊断都应返回结构化结果，而不是只抛出字符串异常

### Observability
- 所有新探针步骤都应复用现有详细错误文本能力
- 必须保留阶段名和底层错误摘要

### Usability
- 用户不需要理解内部 API 名称也能看懂结论
- 但阶段字段仍应保留精确值，方便技术排查

## 📐 Constraints

### Technical Constraints
- 复用现有纯接口注册实现，不新增浏览器依赖
- 继续沿用当前 Electron IPC 与 runtime state 模型
- 测试框架保持 `node:test`

### Product Constraints
- 不新增独立代理管理流程
- 不要求自动筛选或轮询多个代理

## 🚫 Out of Scope

- 自动切换到下一个代理重试注册
- 浏览器模式下的代理指纹诊断
- 判断任意代理是否“永久稳定可注册”
- 修复 Outlook Graph 凭据本身无效的问题

## 📊 Acceptance Criteria

- [x] 运行诊断时能返回代理注册探针结果
- [x] UI 能直接展示“推进到哪一步”以及是否命中 TES
- [x] 网络失败与 TES 拦截能被清晰区分
- [x] 相关测试、类型检查和构建通过

## 🔗 Related Documents

- [Technical Design](../design/20260327-proxy-viability-diagnostics-technical-design.md)
- [IPFoxy 代理同步与 SOCKS5 支持 Requirement](../requirements/20260326-ipfoxy-socks5-proxy-support.md)
- [注册过程强可观测性增强 Requirement](../requirements/20260325-registration-verbose-observability.md)

## 📝 Notes

- 本文档基于用户“可以的，你加个这个功能吧”的直接授权创建，并按用户偏好采用文档优先后直接实现的方式自动批准执行。
