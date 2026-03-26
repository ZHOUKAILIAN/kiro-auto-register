# 出口地区感知的环境画像拟合 - Requirements Document

**Date**: 2026-03-26
**Status**: Approved
**Author**: Codex

## 📋 Overview

### Background
参考仓库 `keggin-CHN/kiro-auto-register` 虽然主注册方案已失效，但它有一层值得借鉴的外围能力：根据代理出口的地区，自动拟合语言、时区、Accept-Language 和设备环境。

当前仓库仍以纯 API 注册链路为主，但默认环境画像基本固定：

- `navigator.language` / `languages` 固定为 `en-US`
- `userAgent` 固定为单一桌面 Chrome
- 注册请求头未根据代理出口自动匹配 `Accept-Language`

这意味着即使出口是日本、德国或其他地区，请求环境仍然表现为固定的美区桌面环境，存在不一致特征。

### Objectives
- 自动根据当前出口国家选择环境画像
- 将该画像同时用于请求头与指纹运行时
- 保持默认无需额外配置，不新增复杂设置面板

## 👥 User Stories

### User Story 1: 我希望代理出口和环境画像更一致
**As a** 使用者
**I want** 系统根据出口国家自动调整请求语言和基础浏览器画像
**So that** 不再总是拿固定的美区环境去请求不同地区的出口

**Acceptance Criteria**:
- [ ] 当出口国家识别为 `JP` 时，优先使用日语 / 日本时区画像
- [ ] 当出口国家识别为 `DE` 时，优先使用德语 / 欧洲时区画像
- [ ] 无法识别时回退到默认美区画像

### User Story 2: 我希望知道系统选了什么环境
**As a** 使用者
**I want** 在注册日志里看到当前自动选择的环境画像
**So that** 我能判断失败是否和出口地区不匹配有关

**Acceptance Criteria**:
- [ ] 注册开始阶段输出自动选择的地区画像
- [ ] 日志中至少包含地区、语言和时区摘要

## 🎯 Functional Requirements

### FR-1: 出口国家到环境画像映射
**Priority**: High
**Description**: 系统需要根据出口国家代码，将代理环境映射到一组标准化环境画像，例如 `usa`、`japan`、`germany`。

### FR-2: 请求头拟合
**Priority**: High
**Description**: 注册请求必须自动使用环境画像中的 `User-Agent` 和 `Accept-Language`。

### FR-3: 指纹运行时拟合
**Priority**: High
**Description**: FWCIM 指纹运行时中的 `navigator.userAgent`、`navigator.language`、`navigator.languages` 等基础属性需要与环境画像保持一致。

### FR-4: 可观测性
**Priority**: Medium
**Description**: 注册日志需要展示自动选中的环境画像，便于本地排障。

## 🔧 Non-Functional Requirements

### Compatibility
- 不破坏当前无代理和 `http/https/socks5/ipfoxy` 代理链路
- 保持默认回退画像，避免因为识别失败导致注册直接中断

### Maintainability
- 环境画像定义集中在独立服务模块
- 地区映射和画像数据可扩展

## 🚫 Out of Scope

- 新增手动选择地区的 UI 配置
- 精确模拟每个国家的完整设备生态
- 保证通过 AWS 风控

## 📊 Acceptance Criteria

- [ ] 代理出口国家会自动映射到环境画像
- [ ] 注册请求头和指纹环境会随画像变化
- [ ] 注册日志会输出环境画像摘要
- [ ] 相关测试、类型检查和构建通过

## 🔗 Related Documents

- [Technical Design](../design/20260326-region-aware-environment-fit-technical-design.md)
- [IPFoxy / SOCKS5 Proxy Support](../requirements/20260326-ipfoxy-socks5-proxy-support.md)

## 📝 Notes

- 本文档基于用户授权“能借鉴的就借鉴一下”创建，并聚焦参考仓库中仍具借鉴价值的地区环境拟合思路。
