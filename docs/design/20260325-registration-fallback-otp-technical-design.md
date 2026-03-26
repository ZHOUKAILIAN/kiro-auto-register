# 注册回退能力（手动 OTP 优先，自带邮箱扩展）- Technical Design Document

**Date**: 2026-03-25
**Status**: Approved
**Author**: Codex
**Related Requirement**: [Requirement Doc](../requirements/20260325-registration-fallback-otp.md)

## 📋 Overview

### Summary
在不引入浏览器注册 fallback 的前提下，为当前纯接口注册链路增加两个关键能力：

1. 在 OTP 阶段暂停并等待用户手动输入验证码，再继续完成后续注册与凭证兑换
2. 提供代理/链路诊断入口，直接展示当前出口 IP、`tempmail` 创建结果和 AWS 最近一次阻塞阶段

本轮只实现手动 OTP 与诊断，邮箱 IMAP/POP3 自动收码仅预留配置结构与服务边界。

### Goals
- 保持当前纯接口注册主链路
- 让注册流程在 OTP 阶段可恢复，而不是只能自动收码或直接失败
- 让 renderer 重载后仍能恢复“等待 OTP 输入”的状态
- 把代理与链路诊断做成 UI 内置能力

### Non-Goals
- 不实现完整 IMAP/POP3 自动收码
- 不实现浏览器注册 fallback
- 不尝试绕过 AWS TES 风控本身

## 🏗️ Architecture

### High-Level Design

```text
Renderer
  ↓ start-register / submit-register-otp / run-register-diagnostics
Preload IPC bridge
  ↓
Main process runtime state
  ↓
kiroRegister.autoRegister()
  ↓
kiroApiRegister.autoRegisterViaApi()
  ↓
OTP resolver
  ├─ tempmail auto polling
  └─ manual OTP promise (held in main process)
```

### Component Overview

#### `src/shared/contracts.ts`
- 新增设置、运行态、诊断结果、手动 OTP 请求等共享类型

#### `src/services/storeSchemas.ts`
- 为新增设置字段提供默认值和兼容性归一化

#### `src/services/kiroApiRegister.ts`
- 扩展注册入参，支持：
  - 注册邮箱来源模式
  - OTP 模式
  - 自定义 OTP resolver
- 在 `send-otp` 成功后，通过统一 OTP resolver 获取验证码

#### `src/main/index.ts`
- 维护注册运行态：
  - `isRegistering`
  - `pendingOtp`
  - `latestDiagnostics`
  - `lastRegistrationFailure`
- 提供新的 IPC：
  - `get-register-runtime-state`
  - `submit-register-otp`
  - `run-register-diagnostics`
- 在主进程内持有手动 OTP promise，避免依赖 renderer 内存

#### `src/preload/index.ts`
- 暴露新的 IPC API 给 renderer

#### `src/renderer/src/App.tsx`
- 新增：
  - OTP 模式与邮箱来源设置
  - 手动 OTP 输入卡片
  - 诊断面板与“运行诊断”按钮
  - 运行态同步

## 📊 Data Models

### Settings

```typescript
type RegistrationEmailMode = 'tempmail' | 'custom';
type OtpMode = 'tempmail' | 'manual' | 'mailbox';

interface AppSettings {
  proxyUrl: string;
  registerCount: number;
  registrationEmailMode: RegistrationEmailMode;
  customEmailAddress: string;
  otpMode: OtpMode;
  customMailboxHost: string;
  customMailboxPort: number;
  customMailboxUsername: string;
  customMailboxPassword: string;
  customMailboxTls: boolean;
  claudeApiBaseUrl: string;
  claudeApiAdminKey: string;
  cliproxyAuthDir: string;
  autoImportClaude: boolean;
  autoWriteCliproxy: boolean;
}
```

### Register Runtime State

```typescript
interface PendingOtpState {
  taskId: string;
  registerIndex: number;
  email: string;
  requestedAt: number;
  source: 'manual';
}

interface RegistrationFailureSummary {
  stage: string;
  message: string;
  timestamp: number;
}

interface RegisterDiagnostics {
  executedAt: number;
  proxyUrl?: string;
  egress?: {
    ip?: string;
    city?: string;
    region?: string;
    country?: string;
    org?: string;
  };
  tempmail: {
    success: boolean;
    message: string;
    email?: string;
  };
  aws?: {
    stage: string;
    message: string;
  };
}

interface RegisterRuntimeState {
  isRegistering: boolean;
  pendingOtp?: PendingOtpState;
  latestDiagnostics?: RegisterDiagnostics;
  lastFailure?: RegistrationFailureSummary;
}
```

## 🔄 Workflows

### Workflow 1: 手动 OTP 注册

1. 用户在 UI 里选择：
   - `registrationEmailMode = custom`
   - `otpMode = manual`
2. Renderer 调用 `start-register`
3. Main process 调用 `autoRegister`, 并传入自定义 `requestOtp`
4. `kiroApiRegister` 完成 `send-otp`
5. `requestOtp` 在 main 中：
   - 生成 `taskId`
   - 更新 `pendingOtp`
   - 发送运行态事件给 renderer
   - 返回一个等待中的 promise
6. 用户在 UI 输入 OTP，调用 `submit-register-otp`
7. Main resolve promise，`kiroApiRegister` 继续执行 `create-identity`
8. 后续兑换凭证、入库、导入逻辑照旧

### Workflow 2: Renderer 重载恢复

1. Renderer 启动时调用 `get-register-runtime-state`
2. 若 main 仍持有 `pendingOtp`，UI 直接显示待输入卡片
3. 用户输入 OTP 后继续当前任务

### Workflow 3: 诊断

1. 用户点击“运行诊断”
2. Main process 使用当前设置代理：
   - 查询出口 IP
   - 调用 `tempmail.lol` 创建邮箱
   - 结合最近一次注册失败摘要生成 AWS 诊断结果
3. 保存 `latestDiagnostics` 并通过事件推送给 renderer

## 🔌 API Design

### Register API

```typescript
interface RegisterFlowOptions {
  proxyUrl?: string;
  registrationEmailMode?: 'tempmail' | 'custom';
  customEmailAddress?: string;
  otpMode?: 'tempmail' | 'manual' | 'mailbox';
  requestOtp?: (request: OtpRequest) => Promise<string>;
}

interface OtpRequest {
  email: string;
  source: 'tempmail' | 'manual';
  otpSentAt: number;
  tempmailToken?: string;
}
```

### New IPC

```typescript
get-register-runtime-state(): Promise<RegisterRuntimeState>
submit-register-otp(taskId: string, otp: string): Promise<{ success: boolean; message: string }>
run-register-diagnostics(): Promise<RegisterDiagnostics>
onRegisterRuntimeState(callback: (state: RegisterRuntimeState) => void): void
```

## 🎯 Implementation Plan

### Phase 1: 类型与文档
- [ ] 补齐 shared contracts
- [ ] 补齐 settings 默认值与 normalize
- [ ] 更新 requirement / design / analysis

### Phase 2: 测试先行
- [ ] 为设置归一化新增字段写测试
- [ ] 为注册服务新增手动 OTP resolver 测试
- [ ] 为诊断结果拼装写测试

### Phase 3: 主流程实现
- [ ] 扩展 `kiroApiRegister` 的邮箱来源和 OTP resolver
- [ ] 在 main 中实现 pending OTP runtime state
- [ ] 新增 OTP 提交与诊断 IPC
- [ ] 更新 preload 和 renderer UI

### Phase 4: 验证
- [ ] 相关 node tests 通过
- [ ] `npm run typecheck` 通过
- [ ] 手动 OTP 流程在 UI 中可触发并可恢复

## 🧪 Testing Strategy

### Unit Tests
- settings 新字段兼容
- 自定义邮箱来源解析
- 手动 OTP resolver 的暂停/恢复
- 诊断结果结构化输出

### Integration Tests
- `autoRegisterViaApi` 在自定义 OTP resolver 下不再直接依赖 `tempmail`
- main 运行态在 OTP 请求前后正确切换

### Manual Verification
- UI 能显示等待 OTP 输入
- renderer 刷新后仍能恢复 pending OTP 卡片
- 诊断按钮能返回出口 IP 和 `tempmail` 结果

## ⚠️ Risks and Mitigations

### Risk 1: OTP 等待态卡死
- **Cause**: 用户未提交 OTP 或提交了错误 `taskId`
- **Mitigation**: main 中保留唯一 pending state，并在 UI 显示清晰任务标识

### Risk 2: 自定义邮箱与 OTP 模式组合不一致
- **Cause**: 用户选择 `custom email + tempmail otp`
- **Mitigation**: main 与 renderer 双重校验，不合法组合自动拒绝

### Risk 3: renderer 重载丢失状态
- **Cause**: 状态只存在 React 内存
- **Mitigation**: pending OTP state 只存 main process，并通过 IPC 重建视图

## 🔒 Security Considerations

- OTP 在日志中不回显完整值
- 自定义邮箱凭证字段先只做结构预留，不在本轮接入外部邮箱登录
- 代理认证信息不在诊断输出中展示

## 📌 Notes

- 当前设计选择“主进程持有 pending OTP promise”，而不是把注册流程拆成两次独立 IPC，是为了减少对现有注册编排与测试的冲击。
- IMAP/POP3 自动收码将在后续迭代复用同一套 `OtpRequest -> requestOtp()` 扩展点。
