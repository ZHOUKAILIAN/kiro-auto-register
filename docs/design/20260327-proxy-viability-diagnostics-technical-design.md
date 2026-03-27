# 代理可用性诊断增强 - Technical Design Document

**Date**: 2026-03-27
**Status**: Implemented
**Author**: Codex
**Related Requirement**: [Requirement Doc](../requirements/20260327-proxy-viability-diagnostics.md)

## 📋 Overview

### Summary
本轮在现有“链路诊断”基础上，新增一层“注册阶段探针”：

1. 继续保留出口、Tempmail、MoeMail、Outlook 的可用性检查
2. 复用 `kiroApiRegister.ts` 里的纯接口注册前半段
3. 只探测到 `send-otp` 为止，不继续创建身份和兑换凭证
4. 将结果以结构化字段透传到 IPC、runtime state 和 renderer

### Goals
- 把“代理是否真的能用于注册”直接变成应用内诊断结果
- 复用当前纯接口实现，避免复制一套 AWS 调用逻辑
- 在 UI 中明确区分 `TES BLOCKED`、网络异常和普通阶段失败

### Non-Goals
- 不实现自动换代理重试
- 不继续执行 `create-identity` / `resolve-sso-token`
- 不引入浏览器版探针

## 🏗️ Architecture

### Updated Modules

#### `src/services/kiroApiRegister.ts`
- 新增导出的注册探针函数，例如 `probeRegistrationPath`
- 复用现有内部步骤：
  - `prepareProfileWorkflow`
  - `startProfileSignup`
  - `sendProfileOtp`
- 返回结构化结果：
  - `success`
  - `stage`
  - `message`
  - `email`
  - `classification`

#### `src/services/registerDiagnostics.ts`
- `runRegisterDiagnostics` 在邮箱可用时继续调用注册探针
- 允许通过可选依赖注入函数覆盖探针逻辑，便于测试
- 将结果挂入 `RegisterDiagnostics.registrationProbe`

#### `src/shared/contracts.ts`
- 扩展 `RegisterDiagnostics`，新增 `registrationProbe`
- 新增可序列化的分类字段，例如：
  - `reachable`
  - `tes-blocked`
  - `network-error`
  - `failed`

#### `src/renderer/src/App.tsx`
- 在链路诊断卡片中新增“代理注册探测”项
- flash 文案补上当前探针结论
- 保留现有“最近阻塞”卡片，继续展示 runtime 历史失败摘要

### New Shared Model

```typescript
interface RegistrationProbeSummary {
  success: boolean;
  stage: string;
  message: string;
  email?: string;
  classification: 'reachable' | 'tes-blocked' | 'network-error' | 'failed';
}
```

## 🔄 Data Flow

### Flow 1: 诊断执行成功推进到 send-otp

1. Renderer 调用 `run-register-diagnostics`
2. `runRegisterDiagnostics` 检测出口信息
3. 创建临时邮箱或验证现有邮箱模式
4. 调用 `probeRegistrationPath`
5. 依次执行：
   - `prepare-profile-workflow`
   - `start-profile-signup`
   - `send-otp`
6. 若 `send-otp` 成功，返回：
   - `success: true`
   - `stage: "send-otp"`
   - `classification: "reachable"`

### Flow 2: 命中 TES

1. 探针执行到 `send-otp`
2. AWS 返回 `HTTP 400 {"errorCode":"BLOCKED","message":"Request was blocked by TES."}`
3. 探针解析错误文本，识别为 `tes-blocked`
4. Renderer 显示“被 TES 拦截”

### Flow 3: 网络异常

1. 探针在任意阶段抛出 socket / TLS / fetch 相关错误
2. 使用 `formatErrorDetails` 保留嵌套 cause
3. 分类为 `network-error`
4. Renderer 显示具体阶段与底层错误摘要

### Flow 4: 邮箱不可用

1. Tempmail 或自定义邮箱诊断先失败
2. `runRegisterDiagnostics` 不再继续执行注册探针
3. `registrationProbe` 留空
4. UI 文案显示“未进入注册探测”

## 🔌 API Design

### `probeRegistrationPath`

```typescript
async function probeRegistrationPath(options: {
  fetchImpl: FetchImpl;
  email: string;
  country?: string;
  onProgress?: (message: string) => void;
}): Promise<RegistrationProbeSummary>
```

**Behavior**:
- 根据 `country` 推导环境画像
- 复用当前 session / cookie / fingerprint 逻辑
- 仅执行注册前半段
- 不消费 OTP，不继续身份创建

### `runRegisterDiagnostics`

扩展可选注入参数：

```typescript
probeRegistrationFn?: (options: {
  fetchImpl: FetchImpl;
  email: string;
  country?: string;
  onProgress?: (message: string) => void;
}) => Promise<RegistrationProbeSummary>;
```

这样测试可以直接 stub，不需要 mock 全部 AWS 请求链路。

## 📊 Data Models

### `RegisterDiagnostics`

```typescript
interface RegisterDiagnostics {
  executedAt: number;
  proxyUrl?: string;
  egress?: { ... };
  tempmail: { ... };
  managedEmail?: { ... };
  mailbox?: { ... };
  registrationProbe?: RegistrationProbeSummary;
  aws?: {
    stage: string;
    message: string;
  };
}
```

说明：
- `registrationProbe` 表示本次诊断主动执行的注册探针结果
- `aws` 继续保留为历史失败摘要兼容字段

## 🎯 Implementation Plan

### Phase 1: 文档与模型
- [x] 新增 requirement / design 文档
- [x] 扩展 shared contracts 中的诊断模型

### Phase 2: 测试先行
- [x] 为 `runRegisterDiagnostics` 新增注册探针相关失败测试
- [x] 为分类与跳过逻辑补测试

### Phase 3: 服务实现
- [x] 在 `kiroApiRegister.ts` 增加注册探针函数
- [x] 在 `registerDiagnostics.ts` 集成注册探针

### Phase 4: UI 展示
- [x] renderer 增加代理注册探测卡片
- [x] flash summary 补充探针结果

## 🧪 Testing Strategy

### Unit Tests
- `registerDiagnostics.test.ts`
  - 邮箱成功时会执行注册探针并写入结果
  - 邮箱失败时不会执行注册探针
  - `tes-blocked` 分类正确
  - 网络异常分类正确

### Service Verification
- 为 `probeRegistrationPath` 增加基础行为测试，或通过注入测试覆盖其集成结果

### Verification Commands
- `node --test --experimental-strip-types $(rg --files src -g '*.test.ts')`
- `npm run typecheck`
- `npm run build`

### Verification Results
- [x] `node --test --experimental-strip-types $(rg --files src -g '*.test.ts')`
- [x] `npm run typecheck`
- [x] `npm run build`

## 🔍 Monitoring & Observability

### Logging
- 诊断阶段继续通过 `onProgress` 输出：
  - `初始化 AWS 纯接口注册`
  - `启动 profile 注册`
  - `发送邮箱验证码`
- 失败时统一输出“阶段 + 明细”

### User-Facing Result
- Renderer 直接展示：
  - 阶段
  - 分类
  - 人类可读信息

## ⚠️ Error Handling

### Scenario 1: TES 阻塞
**Detection**: 错误文本包含 `Request was blocked by TES` 或 `errorCode":"BLOCKED"`
**Recovery**: 不自动重试，提示更换代理
**User Impact**: UI 显示“被 TES 拦截”

### Scenario 2: Socket / TLS / Reset
**Detection**: `formatErrorDetails` 文本包含 `ECONNRESET`、`UND_ERR_SOCKET`、`TLS`
**Recovery**: 不自动重试，提示代理不稳定
**User Impact**: UI 显示“网络失败”

### Scenario 3: 邮箱未准备好
**Detection**: `tempmail` / `mailbox` 诊断失败
**Recovery**: 跳过注册探针
**User Impact**: UI 显示“未进入注册探测”

## 📝 Notes

- 该设计按用户直接授权自动批准并实施。
