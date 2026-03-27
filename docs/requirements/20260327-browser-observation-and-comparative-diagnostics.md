# 浏览器观察与对比诊断增强 - Requirements Document

**Date**: 2026-03-27
**Status**: Implemented
**Author**: Codex

## 📋 Overview

### Background
当前工作台已经可以回答“代理出口在哪”“Tempmail 能不能创建”“纯接口注册能推进到哪一步”，但用户在最近联调中进一步提出了三类需求：

- 想直接在应用里打开一个真实浏览器观察窗口，手动操作时也能看到页面、跳转和关键接口日志
- 想同一轮比较不同邮箱来源的表现，而不是一次只看当前启用的那一种
- 想看到更细的 TES / HTTP / 响应摘要 / 重定向等证据，而不只是一个简短失败文案

本轮实现聚焦“诊断”和“人工辅助观察”，不新增自动提交注册能力。

### Objectives
- 增加浏览器观察模式，用于手动调试真实页面链路
- 在现有诊断里同时比较 Tempmail 与已配置自定义邮箱的注册探针结果
- 将注册探针暴露为更结构化的证据模型，方便判断是网络、TES 还是流程差异

## 👥 User Stories

### User Story 1: 我想在真实浏览器里观察而不是只看纯接口
**As a** 使用者
**I want** 应用内提供一个浏览器观察入口
**So that** 我能手动点击页面，同时在工作台里看到关键日志

**Acceptance Criteria**:
- [x] 可以从当前工作台启动浏览器观察窗口
- [x] 观察窗口打开官方注册页，不自动代替用户提交注册
- [x] 页面导航、关键接口状态和错误会写入本地日志/诊断结果

### User Story 2: 我想对比邮箱来源，而不是只看一个结果
**As a** 使用者
**I want** 诊断同时比较 Tempmail 和已配置自定义邮箱
**So that** 我能判断问题更像是邮箱来源还是环境画像

**Acceptance Criteria**:
- [x] 运行诊断时会生成邮箱来源对比结果
- [x] 如果配置了自定义邮箱，会同时展示该邮箱的探针结论
- [x] 每个候选邮箱都会显示阶段、分类和说明

### User Story 3: 我想拿到更细的失败证据
**As a** 使用者
**I want** 诊断结果里直接暴露 HTTP 状态、响应摘要、重定向和关键 cookie 线索
**So that** 我能更快判断是 TES、TLS、页面链路还是请求画像问题

**Acceptance Criteria**:
- [x] 注册探针结果包含结构化证据字段
- [x] HTTP 失败时能看到状态码与响应摘要
- [x] UI 中可以看到更详细的探针证据而不是只有一句话

## 🎯 Functional Requirements

### FR-1: 浏览器观察窗口
**Priority**: High
**Description**: 工作台必须提供启动真实浏览器观察窗口的入口。

**Details**:
- Input: 当前设置中的代理 URL
- Processing: 打开新的 Electron BrowserWindow，并监听导航、控制台和关键网络事件
- Output: 将浏览器观察摘要写入 runtime state 和本地日志

### FR-2: 邮箱来源对比探测
**Priority**: High
**Description**: 运行诊断时，除当前主探针外，还应生成邮箱来源对比结果。

**Details**:
- 若 Tempmail 创建成功，则加入 Tempmail 候选
- 若配置了自定义邮箱，则加入自定义邮箱候选
- 若两者同时存在，应分别运行最小注册探针并展示结果

### FR-3: 探针证据细化
**Priority**: High
**Description**: 注册探针必须返回结构化证据，而不仅是 message 文本。

**Details**:
- 记录阶段时间线
- 记录最后一次 HTTP 状态与响应摘要
- 记录环境画像摘要与关键 cookie 名称
- 保留人类可读 message 作为兼容字段

### FR-4: UI 可读展示
**Priority**: Medium
**Description**: Renderer 需要在现有链路诊断区域直接展示浏览器观察和邮箱对比结果。

## 🔧 Non-Functional Requirements

### Safety
- 不自动在浏览器观察窗口里提交注册表单
- 不在 UI 中完整暴露长 token、密钥等高敏数据

### Performance
- 诊断增强允许比当前略慢，但仍应控制在单次几十秒内
- 浏览器观察为按需启动，不应阻塞普通诊断

### Reliability
- 浏览器观察窗口关闭后应清理监听器
- 诊断失败也必须返回结构化结果

## 🚫 Out of Scope

- 自动在浏览器中完成注册
- 自动绕过 AWS TES 风控
- 自动切换邮箱/代理重试直到成功

## 📊 Acceptance Criteria

- [x] 工作台支持启动浏览器观察窗口
- [x] 运行诊断时支持邮箱来源对比探测
- [x] 注册探针支持更细的结构化证据
- [x] 相关测试、类型检查和构建通过

## 🔗 Related Documents

- [Technical Design](../design/20260327-browser-observation-and-comparative-diagnostics-technical-design.md)
- [代理可用性诊断增强 Requirement](../requirements/20260327-proxy-viability-diagnostics.md)
- [注册过程强可观测性增强 Requirement](../requirements/20260325-registration-verbose-observability.md)

## 📝 Notes

- 本文档基于用户“先都放进去吧”的直接授权创建，并按用户偏好自动批准执行。
