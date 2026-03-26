# 注册过程强可观测性增强 - Technical Design Document

**Date**: 2026-03-25
**Status**: Approved
**Author**: Codex
**Related Requirement**: [Requirement Doc](../requirements/20260325-registration-verbose-observability.md)

## 📋 Overview

### Summary
本轮不改变注册主链路，而是增强“日志质量”和“用户可见上下文”：

1. Tempmail 创建和轮询增加详细过程日志
2. HTTP 失败尽量带上响应摘要
3. 自动获取和手动提交的 OTP 直接写入本地 UI 日志
4. Renderer 在任务结束时补充逐任务结论，不让失败细节被摘要吞掉

### Goals
- 让用户在不打开开发者工具的情况下定位失败点
- 让 OTP 相关行为在本地 UI 上可见
- 保持当前 `string[]` 日志通道，不引入复杂日志模型

### Non-Goals
- 不引入远程 telemetry
- 不暴露长 token 或密钥明文
- 不改写注册协议本身

## 🏗️ Architecture

### Component Changes

#### `src/services/tempmail.ts`
- 为 `createInbox` 增加可选 `onProgress`
- 在创建邮箱时输出尝试次数、响应状态、重试和成功信息
- 失败时将响应体摘要拼入错误文本
- 在验证码轮询时输出轮询次数、邮件数量、邮件上下文和最终 OTP

#### `src/services/kiroApiRegister.ts`
- 继续透传 `onProgress`
- 在 catch 中输出“阶段 + 错误”的最终失败日志

#### `src/services/registerRuntime.ts`
- 手动 OTP 提交成功时返回带实际验证码的结果文本

#### `src/main/index.ts`
- 在手动 OTP 提交后向日志面板输出实际提交的验证码
- 批量任务失败时将阶段信息拼入任务结果消息

#### `src/renderer/src/App.tsx`
- 保留启动时的即时日志
- 在任务结束后追加逐任务结果行
- flash banner 继续显示摘要，但详细失败依赖日志面板完整保留

## 🔄 Workflows

### Workflow 1: 创建邮箱失败

1. Renderer 发起注册
2. `createInbox` 输出“第 N 次尝试创建邮箱”
3. 若 HTTP 非 2xx，则读取响应文本并写入错误
4. 若满足重试条件，日志显示“准备重试”
5. 最终失败时，日志和任务结果都包含状态码与响应摘要

### Workflow 2: 自动获取 OTP

1. `waitForVerificationCode` 记录轮询开始
2. 每次轮询记录邮件数量
3. 识别到 AWS 邮件时输出发件人与主题
4. 找到验证码后直接写出 `123456`

### Workflow 3: 手动提交 OTP

1. 用户输入验证码并点击提交
2. `submitManualOtp` 返回包含码值的成功消息
3. Main process 将该消息继续推送到日志面板

## 🧪 Testing Strategy

### Unit Tests
- `tempmail.test.ts`
  - 创建邮箱失败时错误文本包含响应摘要
  - 创建邮箱重试过程会输出进度日志
  - 自动获取 OTP 时会输出验证码日志
- `registerRuntime.test.ts`
  - 手动提交 OTP 成功消息包含实际码值

### Verification
- `node --test` 覆盖相关测试文件
- `npm run typecheck`
- `npm run build`

## 📝 Notes

- 该设计按用户直接授权自动批准并实施。
