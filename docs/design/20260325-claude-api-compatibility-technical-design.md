# kkddytd claude-api 兼容增强 - Technical Design Document

**Date**: 2026-03-25
**Status**: Approved
**Author**: Codex
**Related Requirement**: [Requirement Doc](../requirements/20260325-claude-api-compatibility.md)

## 📋 Overview

### Summary
为现有 `claude-api` 导入服务增加双路径兼容策略：

1. 优先调用 `kkddytd/claude-api` 的 `/v2/accounts/import-by-token`
2. 当端点不存在或版本不支持时，自动回退到 `/v2/accounts/import`

### Goals
- 兼容 `kkddytd/claude-api` 当前源码
- 兼容不同版本或分支的导入接口差异
- 把兼容逻辑封装在服务层，不扩散到 UI 和 IPC

### Non-Goals
- 不移除现有导出能力
- 不调整 `cliproxyapi` 逻辑
- 不改注册链路和 store 结构

## 🏗️ Architecture

### High-Level Design

```text
Renderer Action
  ↓
Main IPC import-to-claude-api
  ↓
targetIntegrations.importAccountsToClaudeApi()
  ↓
Try /v2/accounts/import-by-token
  ↓ fallback on 404/405/501
Try /v2/accounts/import
  ↓
Normalize response into ClaudeImportResult
```

### Component Overview

#### `src/services/accountFormats.ts`
- **Responsibility**: 生成 token 导入和 direct import 两种 payload

#### `src/services/targetIntegrations.ts`
- **Responsibility**: 执行双路径导入、处理回退、统一解析结果

#### `src/services/targetIntegrations.test.ts`
- **Responsibility**: 覆盖网络异常和兼容回退回归测试

## 🔌 API Design

### Token Import Payload

```typescript
function buildClaudeApiImportPayload(accounts: StoredAccount[]): ClaudeApiImportItem[]
```

发送到 `/v2/accounts/import-by-token`，字段与 `kkddytd/claude-api` 当前后端保持兼容：
- `clientId`
- `clientSecret`
- `refreshToken`
- `accessToken`
- `email`

### Direct Import Payload

```typescript
function buildClaudeApiDirectImportPayload(accounts: StoredAccount[]): ClaudeApiDirectImportItem[]
```

发送到 `/v2/accounts/import`，字段对齐当前源码中的 `handleImportAccounts`：
- `label`
- `clientId`
- `clientSecret`
- `refreshToken`
- `accessToken`
- `enabled`
- `errorCount`
- `successCount`

## 🔄 Workflows

### Workflow 1: 兼容导入

1. 构建 token import payload
2. 调用 `/v2/accounts/import-by-token`
3. 如果返回 404/405/501，则构建 direct import payload
4. 调用 `/v2/accounts/import`
5. 把服务端响应统一映射为 `ClaudeImportResult`
6. 若 direct import 只能导入一部分账号，则在消息和失败统计中体现

## 🧪 Testing Strategy

### Unit Tests
- token import payload 字段正确
- direct import payload 字段正确

### Integration Tests
- `/import-by-token` 不可用时会自动回退 `/import`
- 网络异常返回结构化失败结果

## ⚠️ Error Handling

### Scenario 1: Token Import Endpoint Missing
- **Detection**: HTTP 404/405/501
- **Recovery**: 自动回退 `/v2/accounts/import`

### Scenario 2: Network Failure
- **Detection**: `fetch` 抛错
- **Recovery**: 返回失败结果，不回退到另一路径

### Scenario 3: Missing Direct Import Credentials
- **Detection**: 账号缺少 `clientId/clientSecret`
- **Recovery**: direct import payload 过滤这些账号，并把跳过数量写入结果消息
