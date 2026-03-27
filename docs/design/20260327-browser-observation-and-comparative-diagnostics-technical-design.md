# 浏览器观察与对比诊断增强 - Technical Design Document

**Date**: 2026-03-27
**Status**: Implemented
**Author**: Codex
**Related Requirement**: [Requirement Doc](../requirements/20260327-browser-observation-and-comparative-diagnostics.md)

## 📋 Overview

### Summary
本轮诊断增强分为三部分：

1. 在现有注册探针上增加结构化证据
2. 在一次诊断中同时比较 Tempmail 与自定义邮箱
3. 增加手动浏览器观察窗口，用于查看真实页面链路与关键网络事件

### Goals
- 明确区分“邮箱来源问题”“网络问题”“TES 风控问题”“浏览器/页面差异”
- 继续保留当前工作台的一站式诊断体验
- 不改变现有自动注册主链路

### Non-Goals
- 不自动控制浏览器完成注册
- 不把浏览器观察做成完整 DevTools 替代品

## 🏗️ Architecture

### Updated Modules

#### `src/shared/contracts.ts`
- 为 `RegistrationProbeSummary` 增加 `evidence`
- 新增邮箱对比项与浏览器观察结果模型
- 将浏览器观察结果挂入 `RegisterDiagnostics`

#### `src/services/kiroApiRegister.ts`
- 给 `requestJsonOrThrow` 产出的错误附加结构化 HTTP 元数据
- 在 `probeRegistrationPath` 中组装阶段时间线、状态码、响应摘要、环境画像和 cookie 名称

#### `src/services/registerDiagnostics.ts`
- 生成 `registrationComparisons`
- 保留 `registrationProbe` 作为当前主结论
- 主结论按当前邮箱模式优先级选择，自定义优先自定义邮箱，默认优先 Tempmail

#### `src/services/browserObservation.ts`
- 提供纯辅助函数，用于判断哪些 URL / 事件值得记录
- 提供主进程可复用的摘要构建逻辑

#### `src/main/index.ts`
- 新增 IPC：例如 `start-browser-observation`
- 创建观察窗口并监听：
  - `console-message`
  - `did-start-navigation`
  - `will-redirect`
  - `did-navigate`
  - `did-fail-load`
  - `webContents.debugger` 的关键网络事件
- 将观察结果同步到 runtime state

#### `src/renderer/src/App.tsx`
- 增加“浏览器观察”按钮
- 诊断卡片新增：
  - 浏览器观察摘要
  - 邮箱来源对比列表
  - 更细的注册探针证据展示

## 🔄 Data Flow

### Flow 1: 运行对比诊断
1. Renderer 调用 `run-register-diagnostics`
2. `registerDiagnostics` 创建 Tempmail（若成功）
3. 根据设置收集候选邮箱：
   - Tempmail
   - 自定义邮箱
4. 对每个候选执行 `probeRegistrationPath`
5. 组装 `registrationComparisons`
6. 根据当前模式选出 `registrationProbe` 作为主结论

### Flow 2: 浏览器观察
1. Renderer 调用 `start-browser-observation`
2. Main process 创建新窗口并打开官方注册页
3. 监听导航、控制台和关键网络事件
4. 将观察摘要保存到 runtime state，并向日志面板推送文本日志
5. 用户手动关闭窗口或继续手动调试

## 📊 Data Models

### RegistrationProbeEvidence

```typescript
interface RegistrationProbeEvidence {
  environmentSummary?: string;
  httpStatus?: number;
  requestUrl?: string;
  responseSnippet?: string;
  cookieNames?: string[];
  stageTrace: Array<{
    stage: string;
    ok: boolean;
    detail: string;
  }>;
}
```

### RegistrationComparison

```typescript
interface RegistrationComparison {
  label: string;
  email: string;
  source: 'tempmail' | 'custom';
  result?: RegistrationProbeSummary;
  skippedReason?: string;
}
```

### BrowserObservationSummary

```typescript
interface BrowserObservationSummary {
  active: boolean;
  startedAt: number;
  currentUrl?: string;
  lastTitle?: string;
  lastError?: string;
  latestInterestingEvents: string[];
  latestNetworkHits: Array<{
    url: string;
    status?: number;
    type: 'request' | 'response' | 'failure' | 'redirect' | 'navigation';
  }>;
}
```

## 🎯 Implementation Plan

### Phase 1: 文档
- [x] 新增 requirement / design 文档

### Phase 2: 测试先行
- [x] 为邮箱对比探测补失败测试
- [x] 为更细的 probe evidence 补测试
- [x] 为浏览器观察辅助逻辑补测试

### Phase 3: 服务实现
- [x] 扩展 shared contracts
- [x] 实现 probe evidence
- [x] 实现 registration comparisons
- [x] 增加 browser observation service / IPC

### Phase 4: UI 展示
- [x] 增加浏览器观察按钮和摘要
- [x] 增加邮箱来源对比展示
- [x] 展示更细的探针证据

## 🧪 Testing Strategy

### Unit Tests
- `registerDiagnostics.test.ts`
  - 同时生成 Tempmail 与自定义邮箱对比结果
  - 主 probe 选择符合当前模式
- `registerDiagnosticsUi.test.ts`
  - 对比结果与证据摘要文案正确
- `browserObservation.test.ts`
  - 关键 URL / 事件筛选逻辑正确
- `kiroApiRegister.test.ts`
  - probe evidence 对 HTTP/TES 场景提取正确

### Verification Commands
- `node --test --experimental-strip-types $(rg --files src -g '*.test.ts')`
- `npm run typecheck`
- `npm run build`

### Verification Results
- [x] `node --test --experimental-strip-types $(rg --files src -g '*.test.ts')`
- [x] `npm run typecheck`
- [x] `npm run build`

## ⚠️ Error Handling

### Scenario 1: 浏览器观察窗口创建失败
- UI 显示明确失败信息
- 不影响现有诊断功能

### Scenario 2: 自定义邮箱未配置
- 对比结果中仅显示 Tempmail，或将自定义邮箱标记为 skipped

### Scenario 3: 探针 HTTP 失败
- 在 `message` 保留简明错误
- 在 `evidence` 中补充状态码、URL 与响应摘要

## 📝 Notes

- 该设计按用户直接授权自动批准并实施。
