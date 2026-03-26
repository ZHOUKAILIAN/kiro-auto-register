# Outlook 邮箱自动收码（导入 Graph 凭据）- Technical Design Document

**Date**: 2026-03-26
**Status**: Approved
**Author**: Codex
**Related Requirement**: [Requirement Doc](../requirements/20260326-outlook-mailbox-auto-otp.md)

## 📋 Overview

### Summary
本轮在现有 OTP 扩展位上真正落地 `mailbox` 模式，但范围仅覆盖“已导入 Outlook Graph 凭据的邮箱自动收码”：

1. 在设置中保存 Outlook `client_id` 与 `refresh_token`
2. 新增独立 `outlookMailbox` 服务
3. 在注册 OTP 阶段调用 Outlook Graph 自动轮询邮件
4. 将 Outlook 鉴权与收码状态输出到日志与诊断

### Goals
- 保持现有纯 API 注册主链路不变
- 让自定义 Outlook 邮箱不再只能走手动 OTP
- 保证 Outlook 自动收码失败时有足够的可观测性

### Non-Goals
- 不实现 Outlook 账号注册
- 不实现完整的 Microsoft OAuth 授权向导
- 不实现通用 IMAP/POP3 provider

## 🏗️ Architecture

### New Module

#### `src/services/outlookMailbox.ts`
- 负责：
  - 刷新 Graph `access_token`
  - 读取最新邮件
  - 提取 6 位验证码
  - 轮询直到超时
- 对外暴露：
  - `waitForOutlookVerificationCode`
  - `probeOutlookMailbox`

### Updated Modules

#### `src/shared/contracts.ts`
- 新增 Outlook 设置字段
- 扩展 `RegisterDiagnostics.mailbox`
- 扩展 `OtpRequest.source`

#### `src/services/storeSchemas.ts`
- 为 Outlook 设置字段提供默认值和兼容性归一化

#### `src/services/kiroApiRegister.ts`
- 真正支持 `otpMode = mailbox`
- 在 OTP 阶段调用外部 OTP provider，而不是直接报未实现

#### `src/main/index.ts`
- 在 `mailbox` 模式下调用 Outlook provider
- 如果刷新后拿到新的 `refresh_token`，回写到本地 settings
- 诊断流程按需调用 Outlook probe

#### `src/renderer/src/App.tsx`
- 自定义邮箱模式下允许选择 `mailbox`
- 新增 Outlook Graph 配置输入区域
- 在诊断面板中显示邮箱自动收码摘要

## 📊 Data Models

```typescript
type MailboxProvider = 'outlook-graph';

interface AppSettings {
  proxyUrl: string;
  registerCount: number;
  registrationEmailMode: 'tempmail' | 'custom';
  customEmailAddress: string;
  otpMode: 'tempmail' | 'manual' | 'mailbox';
  mailboxProvider: MailboxProvider;
  outlookClientId: string;
  outlookRefreshToken: string;
  customMailboxHost: string;
  customMailboxPort: number;
  customMailboxUsername: string;
  customMailboxPassword: string;
  customMailboxTls: boolean;
}

interface RegisterDiagnostics {
  executedAt: number;
  proxyUrl?: string;
  egress?: { ... };
  tempmail: { ... };
  mailbox?: {
    provider: MailboxProvider;
    success: boolean;
    message: string;
    email?: string;
  };
  aws?: { ... };
}

interface OutlookMailboxOtpResult {
  code: string | null;
  nextRefreshToken?: string;
}
```

## 🔄 Workflows

### Workflow 1: Outlook 自动收码注册

1. 用户选择：
   - `registrationEmailMode = custom`
   - `otpMode = mailbox`
   - `mailboxProvider = outlook-graph`
2. 主进程发起注册
3. `kiroApiRegister` 完成 `send-otp`
4. `kiroApiRegister` 调用 `requestOtp({ source: 'mailbox', ... })`
5. Main process 调用 `waitForOutlookVerificationCode`
6. Outlook provider：
   - 刷新 `access_token`
   - 拉取最近邮件
   - 过滤 AWS 发件人 / 近期邮件
   - 提取 6 位验证码
7. 成功则返回 OTP，继续 `create-identity`
8. 若返回新 `refresh_token`，主进程保存更新后的 settings

### Workflow 2: Outlook 诊断

1. 用户点击“运行诊断”
2. 保留原有出口与 `tempmail` 诊断
3. 如果当前设置满足：
   - `registrationEmailMode = custom`
   - `otpMode = mailbox`
   - `mailboxProvider = outlook-graph`
4. 额外执行一次 Outlook `probe`
5. 在诊断面板展示结构化结果

## 🔌 API Design

### Outlook Mailbox Service

```typescript
interface OutlookMailboxConfig {
  email: string;
  clientId: string;
  refreshToken: string;
  otpSentAt?: number;
  timeoutMs?: number;
  pollIntervalMs?: number;
  onProgress?: (message: string) => void;
  fetchImpl?: Fetch;
}

interface OutlookMailboxOtpResult {
  code: string | null;
  nextRefreshToken?: string;
}

function waitForOutlookVerificationCode(
  config: OutlookMailboxConfig
): Promise<OutlookMailboxOtpResult>;

function probeOutlookMailbox(
  config: OutlookMailboxConfig
): Promise<{ success: boolean; message: string; nextRefreshToken?: string }>;
```

### `requestOtp` Source Extension

```typescript
interface OtpRequest {
  email: string;
  source: 'tempmail' | 'manual' | 'mailbox';
  otpSentAt: number;
  tempmailToken?: string;
}
```

## 🎯 Implementation Plan

### Phase 1: 文档与类型
- [ ] 新增 requirement / design 文档
- [ ] 补齐 settings / diagnostics / OTP source 类型

### Phase 2: 测试先行
- [ ] 为 Outlook mailbox service 写 token 刷新与验证码提取测试
- [ ] 为 settings 新字段写兼容测试
- [ ] 为 `mailbox` OTP 路径写行为测试

### Phase 3: 服务与主流程
- [ ] 实现 `outlookMailbox.ts`
- [ ] 接入 main register workflow
- [ ] 接入 diagnostics

### Phase 4: UI 与验证
- [ ] 更新 renderer 设置区
- [ ] 更新 hint / startup message
- [ ] 运行 `node --test`
- [ ] 运行 `npm run typecheck`
- [ ] 运行 `npm run build`

## 🧪 Testing Strategy

### Unit Tests
- Outlook token 刷新与邮件读取
- 验证码提取规则
- settings 新字段归一化
- startup message 对 `mailbox` 模式的展示

### Integration Tests
- `kiroApiRegister` 在 `mailbox` 模式下走外部 OTP provider
- diagnostics 在 Outlook 模式下返回 mailbox 摘要

## ⚠️ Risks and Mitigations

### Risk 1: Refresh token 过期
- **Mitigation**: 暴露清晰错误信息，并在 token 刷新返回新 token 时立刻回写

### Risk 2: 邮件 API 成功但正文格式变动
- **Mitigation**: 同时从 `body`、`bodyPreview`、HTML 转文本结果中提取 OTP

### Risk 3: Outlook 逻辑污染现有 tempmail / manual 流程
- **Mitigation**: Outlook 收码隔离在独立服务，通过 `requestOtp` 扩展点接入

## 🔒 Security Considerations

- 仅在本地保存 Outlook `refresh_token`
- 日志中只展示 token 掩码
- 不在诊断结果中回显完整凭据

## 📝 Notes

- 本设计借鉴了参考仓库中仍可复用的 Outlook Graph 收码与验证码提取实现，但按当前 Electron 工作台结构重新收敛为独立服务。

## ✅ Validation Results

- `node --test` 通过
- `npm run typecheck` 通过
- `npm run build` 通过
