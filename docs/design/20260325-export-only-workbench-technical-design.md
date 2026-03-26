# Kiro 导出型工作台收敛 - Technical Design Document

**Date**: 2026-03-25
**Status**: Approved
**Author**: Codex
**Related Requirement**: [Requirement Doc](../requirements/20260325-export-only-workbench.md)

## 📋 Overview

### Summary
将当前应用从“注册 + 下游仓库集成控制台”收敛为“注册 + 本地账号池 + 导出工作台”。

实现上不追求删除所有历史集成代码，而是优先完成三件事：

1. 从共享设置模型中移除下游仓库专用字段
2. 从主流程、IPC 和 renderer 中移除下游仓库入口
3. 为导出能力提供中性应用层接口，继续沿用现有兼容字段结构

### Goals
- 让主应用设置和 IPC 聚焦当前仓库自身职责
- 保持注册、诊断、OTP 回退、账号池、导出能力完整可用
- 不破坏已保存账号与现有导出格式

### Non-Goals
- 不删除 `targetIntegrations.ts` 的历史实现
- 不修改导出 JSON 的字段结构
- 不新增新的远程集成能力

## 🏗️ Architecture

### High-Level Design

```text
Renderer
  ↓ start-register / export-accounts / run-register-diagnostics
Preload IPC bridge
  ↓
Main process workflow
  ↓
kiroRegister.autoRegister()
  ↓
exchangeSsoToken()
  ↓
save local account
  ↓
export payload on demand
```

### Component Changes

#### `src/shared/contracts.ts`
- 精简 `AppSettings` 和 `RegisterOptions`
- 去掉外部仓库专用字段
- 保留账号、运行态和导出相关共享类型

#### `src/services/storeSchemas.ts`
- 更新默认设置与归一化逻辑
- 对历史 settings 中遗留的外部仓库字段自动忽略

#### `src/services/accountFormats.ts`
- 新增应用层通用导出函数
- 保持底层兼容 payload 结构不变

#### `src/main/index.ts`
- 删除注册成功后的自动下游导入逻辑
- 删除外部仓库相关 IPC handler
- `export-accounts` 改为走通用导出函数

#### `src/preload/index.ts` / `src/renderer/src/env.d.ts`
- 删除外部仓库相关 bridge API
- 保留注册、导出、诊断、删除等能力

#### `src/renderer/src/App.tsx`
- 删除下游仓库设置项、按钮和提示卡片
- 收敛页面标题、说明文案和按钮描述
- 保留导出提示、禁用态和错误反馈

## 🔄 Workflows

### Workflow 1: 注册并保存本地账号

1. 用户配置注册参数、代理和 OTP 模式
2. Renderer 调用 `start-register`
3. Main process 执行注册、OTP 恢复、凭证兑换
4. 成功后写入本地账号池
5. 返回“已保存本地账号”的结果消息，不触发任何下游动作

### Workflow 2: 导出账号数据

1. 用户在账号池为空时，导出按钮保持禁用
2. 有账号后，Renderer 调用 `export-accounts`
3. Main process 使用通用导出函数生成 JSON 字符串
4. Renderer 下载本地文件

## 🧪 Testing Strategy

### Unit Tests
- `storeSchemas.test.ts`
  - 校验新的设置模型不再包含外部仓库字段
  - 校验历史设置输入仍能被兼容归一化
- `accountFormats.test.ts`
  - 校验通用导出函数仍输出兼容 payload

### Verification
- `npm run typecheck`
- `npm run build`
- 相关 node test

## 📌 Migration Notes

- 历史 `config.json` 中若存在 `claudeApiBaseUrl`、`claudeApiAdminKey`、`cliproxyAuthDir`、`autoImportClaude`、`autoWriteCliproxy`，新版本会忽略这些字段
- 历史账号数据结构保持不变，不需要迁移

## 📝 Notes

- 该设计按用户直接授权自动批准并实施，不再等待额外确认。
