# Tempmail.lol 注册流程加固 - Technical Design Document

**Date**: 2026-03-25
**Status**: Approved
**Author**: Codex
**Related Requirement**: [Requirement Doc](../requirements/20260325-tempmail-registration-hardening.md)

## 📋 Overview

### Summary
参考 `cnlimiter/codex-manager` 在临时邮箱阶段的稳态做法，对当前 Kiro 注册实现做三类增强：

1. Tempmail 邮件时间解析与 OTP 时间锚点过滤
2. 创建邮箱的有限重试与退避
3. Kiro 注册阶段显式记录 OTP 触发时刻，并将其传入邮箱轮询

### Goals
- 提升验证码阶段稳定性
- 降低历史邮件误命中和 Tempmail 短暂异常带来的失败率

### Non-Goals
- 不迁移 `codex-manager` 的 OpenAI 注册协议
- 不引入多邮箱供应商 UI

## 🏗️ Architecture

### High-Level Design

```text
Kiro Register Flow
  ↓ trigger OTP
record otpSentAt
  ↓
Tempmail waitForVerificationCode(token, timeout, { otpSentAt })
  ↓
parse message timestamps
  ↓
ignore stale emails
  ↓
extract current verification code
```

### Component Overview

#### `src/services/tempmail.ts`
- **Responsibility**: Tempmail 创建、收件箱读取、验证码轮询
- **Enhancements**:
  - 时间字段解析
  - OTP 锚点过滤
  - 创建邮箱重试

#### `src/services/kiroRegister.ts`
- **Responsibility**: 注册流程入口
- **Enhancements**:
  - 在触发验证码前记录 `otpSentAt`
  - 把锚点传给邮箱轮询

#### Tests
- **Location**: `src/services/tempmail.test.ts`
- **Responsibility**: 覆盖时间解析、锚点过滤、重试行为

## 🔌 API Design

### `waitForVerificationCode`

```typescript
function waitForVerificationCode(
  token: string,
  timeout?: number,
  onProgress?: (message: string) => void,
  options?: { otpSentAt?: number }
): Promise<string | null>
```

### `createInbox`

```typescript
function createInbox(options?: { maxRetries?: number; retryDelayMs?: number }): Promise<TempmailInbox>
```

## 🔄 Workflows

### Workflow 1: 创建邮箱
1. 调用 `/inbox/create`
2. 如果命中暂时性失败，执行有限重试
3. 返回邮箱地址与 token

### Workflow 2: 获取 OTP
1. 注册流程触发验证码发送前记录 `otpSentAt`
2. 轮询 `/inbox`
3. 解析邮件接收时间
4. 忽略早于锚点减去容差窗口的邮件
5. 从最新符合条件的邮件中提取 6 位验证码

## 🧪 Testing Strategy

### Unit Tests
- 旧邮件会被过滤
- `date` 和 `received_at` 字段都能被识别
- ISO 时间字符串和毫秒时间戳能正确归一化
- 创建邮箱短暂失败后会重试成功

## ⚠️ Error Handling

### Scenario 1: Tempmail 429 / 5xx
- **Recovery**: 有限重试后再失败

### Scenario 2: 收件箱接口短暂异常
- **Recovery**: 在总超时内继续轮询

### Scenario 3: 历史邮件误命中
- **Recovery**: 通过 `otpSentAt` + 容差过滤
