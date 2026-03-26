# 出口地区感知的环境画像拟合 - Technical Design Document

**Date**: 2026-03-26
**Status**: Approved
**Author**: Codex
**Related Requirement**: [Requirement Doc](../requirements/20260326-region-aware-environment-fit.md)

## 📋 Overview

### Summary
本轮不改注册协议本身，而是在当前纯 API 链路外面增加一层“环境画像拟合”：

1. 通过当前 `fetchImpl` 获取出口 IP 信息
2. 将出口国家映射到预设环境画像
3. 将画像应用到请求头与 FWCIM 指纹运行时
4. 在日志中输出自动选中的画像摘要

### Goals
- 让出口国家与请求环境更一致
- 保持零配置自动运行
- 尽量复用现有诊断逻辑和环境探测能力

### Non-Goals
- 不新增复杂配置 UI
- 不引入真实浏览器自动化
- 不承诺解决 AWS 网络或 TES 风控

## 🏗️ Architecture

### New Module

#### `src/services/environmentProfile.ts`
- 定义标准环境画像数据
- 负责国家代码到画像的映射
- 暴露日志摘要与请求头摘要

### Updated Modules

#### `src/services/registerDiagnostics.ts`
- 导出复用的出口探测函数，避免注册主链路重复定义

#### `src/services/kiroApiRegister.ts`
- 在注册开始阶段获取出口信息
- 基于出口国家选择环境画像
- `ApiSession` 注入该画像
- 默认请求头带上 `User-Agent`、`Accept-Language`
- 日志输出“自动环境画像”摘要

#### `src/services/fingerprintRuntime.ts`
- `generateFingerprint` 支持接受环境画像
- 在 `navigator.userAgent`、`navigator.language`、`navigator.languages`、`navigator.platform` 上应用画像

## 🔄 Workflow

### 注册启动

1. 创建 `FetchContext`
2. 用同一 `fetchImpl` 读取出口信息
3. 调用 `resolveEnvironmentProfileFromEgress`
4. 输出日志，例如：`自动环境画像：JAPAN / ja-JP / Asia/Tokyo`
5. 后续注册请求与指纹生成都复用该画像

## 🧪 Testing Strategy

### Unit Tests
- `environmentProfile.test.ts`
  - `JP -> japan`
  - `DE -> germany`
  - 未知国家回退 `usa`
- `kiroApiRegister.test.ts`
  - 请求头应用 `User-Agent` / `Accept-Language`
- `fingerprintRuntime.test.ts` 或受控辅助测试
  - 画像能够改变 `navigator.language` 等环境值

### Verification
- `node --test` 运行新增与受影响测试
- `npm run typecheck`
- `npm run build`

## 📝 Notes

- 该设计按用户直接授权自动批准并实施。

## ✅ Validation Results

- `node --test` 通过
- `npm run typecheck` 通过
- `npm run build` 通过
