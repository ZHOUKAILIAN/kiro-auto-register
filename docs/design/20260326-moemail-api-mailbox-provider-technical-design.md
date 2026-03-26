# MoeMail API 邮箱 Provider 接入 - Technical Design Document

**Date**: 2026-03-26
**Status**: Approved
**Author**: Codex
**Related Requirement**: [Requirement Doc](../requirements/20260326-moemail-api-mailbox-provider.md)

## 📋 Overview

### Summary
本轮会把 `MoeMail API` 作为新的自动邮箱 provider 接进当前 Electron 工作台，但范围仅覆盖“用户已拥有 MoeMail 账号与 API Key”后的自动邮箱能力：

1. 在设置中新增自动邮箱 provider 和 MoeMail OpenAPI 配置
2. 新增独立 `moemail` 服务用于配置读取、建箱、拉信、OTP 提取和 provider 诊断
3. 在注册主流程中根据 provider 选择 `tempmail.lol` 或 `MoeMail API`
4. 在 UI 和链路诊断中暴露当前自动邮箱 provider 状态

### Goals
- 保持现有纯 API 注册主链路不变
- 让自动邮箱来源不再只依赖 `tempmail.lol`
- 保证 MoeMail 接入失败时有足够的可观测性

### Non-Goals
- 不实现 MoeMail 站点账号自动注册
- 不实现 Turnstile 自动求解
- 不接入 MoeMail 的角色管理或站点配置页面

## 🏗️ Architecture

### New Module

#### `src/services/moemail.ts`
- 负责：
  - 标准化 MoeMail base URL 和请求头
  - 读取 `/api/config`
  - 调用 `/api/emails/generate` 创建邮箱
  - 轮询 `/api/emails/{emailId}` / `/api/emails/{emailId}/{messageId}`
  - 从邮件正文中提取 6 位验证码
  - 执行最小 provider 诊断
- 对外暴露：
  - `createMoeMailInbox`
  - `waitForMoeMailVerificationCode`
  - `probeMoeMailProvider`

### Updated Modules

#### `src/shared/contracts.ts`
- 新增：
  - `ManagedEmailProvider = 'tempmail.lol' | 'moemail-api'`
  - MoeMail 设置字段
  - 诊断结果中的 `managedEmail`

#### `src/services/storeSchemas.ts`
- 为 provider 选择与 MoeMail 配置提供默认值和兼容性归一化

#### `src/services/kiroApiRegister.ts`
- 扩展自动邮箱模式的 inbox 解析逻辑
- 当 provider 为 `moemail-api` 时创建 MoeMail 邮箱
- 自动 OTP 路径改为根据 provider 调用对应轮询实现

#### `src/main/index.ts`
- 将 MoeMail provider 配置注入注册流程
- 诊断流程按当前 provider 调用 MoeMail probe

#### `src/services/registerDiagnostics.ts`
- 保留原有 tempmail 与 Outlook 诊断
- 新增当前自动邮箱 provider 的摘要结果

#### `src/renderer/src/App.tsx`
- 自动邮箱模式下新增 provider 选择
- MoeMail provider 下新增 `base URL`、`API Key`、域名设置
- 诊断卡片展示当前自动邮箱 provider 状态

## 📊 Data Models

```typescript
type ManagedEmailProvider = 'tempmail.lol' | 'moemail-api';

interface AppSettings {
  registrationEmailMode: 'tempmail' | 'custom';
  managedEmailProvider: ManagedEmailProvider;
  moemailBaseUrl: string;
  moemailApiKey: string;
  moemailPreferredDomain: string;
  otpMode: 'tempmail' | 'manual' | 'mailbox';
  mailboxProvider: 'outlook-graph';
  // ...
}

interface MoeMailInbox {
  id: string;
  email: string;
  createdAt: number;
  provider: 'moemail-api';
}

interface RegistrationInbox {
  email: string;
  token?: string;
  providerId?: string;
  createdAt: number;
  source: 'tempmail' | 'custom';
  managedProvider?: ManagedEmailProvider;
}

interface RegisterDiagnostics {
  executedAt: number;
  tempmail: { ... };
  managedEmail?: {
    provider: ManagedEmailProvider;
    success: boolean;
    message: string;
    email?: string;
  };
  mailbox?: { ... };
}
```

## 🔄 Workflows

### Workflow 1: MoeMail 自动邮箱注册

1. 用户选择：
   - `registrationEmailMode = tempmail`
   - `managedEmailProvider = moemail-api`
2. 主进程发起注册
3. `kiroApiRegister.resolveInbox()` 调用 `createMoeMailInbox`
4. 拿到邮箱地址后继续 `prepare-profile-workflow`
5. `send-otp` 成功后，注册流程进入 OTP 等待
6. `resolveOtpCode()` 根据 provider 调用 `waitForMoeMailVerificationCode`
7. 成功提取 6 位 OTP 后继续 `create-identity`

### Workflow 2: MoeMail Provider 诊断

1. 用户点击“运行诊断”
2. 继续保留原有出口、Tempmail 与 Outlook 诊断
3. 若当前自动邮箱 provider 为 `moemail-api`
4. 额外执行：
   - `/api/config`
   - 域名选择
   - 最小建箱探测
5. 在诊断结果中写入 `managedEmail`

## 🔌 API Design

### MoeMail Service

```typescript
interface MoeMailConfig {
  baseUrl: string;
  apiKey: string;
  preferredDomain?: string;
  fetchImpl?: FetchImpl;
  onProgress?: (message: string) => void;
}

interface MoeMailInbox {
  id: string;
  email: string;
  createdAt: number;
  provider: 'moemail-api';
}

function createMoeMailInbox(config: MoeMailConfig): Promise<MoeMailInbox>;

function waitForMoeMailVerificationCode(
  inbox: MoeMailInbox,
  timeoutMs: number,
  options?: MoeMailConfig & { otpSentAt?: number; pollIntervalMs?: number }
): Promise<string | null>;

function probeMoeMailProvider(config: MoeMailConfig): Promise<{
  success: boolean;
  message: string;
  email?: string;
}>;
```

### Register Flow Extension

```typescript
interface AutoRegisterFlowOptions {
  registrationEmailMode?: RegistrationEmailMode;
  managedEmailProvider?: ManagedEmailProvider;
  moemailConfig?: {
    baseUrl: string;
    apiKey: string;
    preferredDomain?: string;
  };
  // ...
}
```

## 🎯 Implementation Plan

### Phase 1: 文档与类型
- [ ] 新增 requirement / design 文档
- [ ] 扩展 settings / diagnostics / register options 类型

### Phase 2: 测试先行
- [ ] 为 `moemail.ts` 写建箱、配置读取、OTP 提取测试
- [ ] 为 settings 新字段写兼容测试
- [ ] 为注册流程 provider 选择写行为测试

### Phase 3: 服务与主流程
- [ ] 实现 `moemail.ts`
- [ ] 接入 `kiroApiRegister`
- [ ] 接入 main register workflow 与 diagnostics

### Phase 4: UI 与验证
- [ ] 更新 renderer 设置区和诊断区
- [ ] 更新启动提示文案
- [ ] 运行 `node --test`
- [ ] 运行 `npm run typecheck`
- [ ] 运行 `npm run build`

## 🧪 Testing Strategy

### Unit Tests
- MoeMail `baseUrl` 标准化
- `/api/config` 解析与域名选择
- 邮件正文 OTP 提取
- settings 新字段归一化
- startup message 对 provider 的展示

### Integration Tests
- `kiroApiRegister` 在 MoeMail provider 下创建邮箱并走自动 OTP
- `registerDiagnostics` 在 MoeMail provider 下返回摘要

## ⚠️ Risks and Mitigations

### Risk 1: API Key 权限不足
- **Mitigation**: 将 `401/403` 原样归类进错误消息，提示用户确认角色和 API Key

### Risk 2: 线上 API 文档与真实行为不一致
- **Mitigation**: 实现时以真实 HTTP 行为和源码路由为准，不依赖 README 假设

### Risk 3: MoeMail 逻辑污染现有 tempmail / Outlook 路径
- **Mitigation**: MoeMail 逻辑封装在独立服务中，主流程只基于 provider 做有限分支

## 🔒 Security Considerations

- API Key 只保存在本地设置
- UI / 日志中仅显示掩码后的 API Key
- 不记录完整邮件正文到长期持久化存储
- 明确不实现站点注册与 Turnstile 绕过

## 📝 Notes

- 当前调研已确认 `https://moemail.app/en/login` 线上开启 Turnstile，site key 可见但注册依赖交互验证，不属于本轮范围。
- 当前调研已确认 `https://moemail.app/api/config` 线上真实行为要求鉴权，应以线上结果为准。

## ✅ Validation Results

- 待实现后补充
