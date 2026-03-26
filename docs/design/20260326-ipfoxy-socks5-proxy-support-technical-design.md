# IPFoxy 代理同步与 SOCKS5 支持 - Technical Design Document

**Date**: 2026-03-26
**Status**: Approved
**Author**: Codex
**Related Requirement**: [Requirement Doc](../requirements/20260326-ipfoxy-socks5-proxy-support.md)

## 📋 Overview

### Summary
本轮在不扩展复杂 UI 的前提下，为现有 `proxyUrl` 增加两层能力：

1. 识别 `ipfoxy://<userId>:<proxyKey>` 并同步 IPFoxy 代理列表
2. 识别 `socks5://user:pass@host:port` 并通过本地临时 HTTP CONNECT bridge 适配到 `undici ProxyAgent`

### Goals
- 让当前工作台直接消费用户现有的 IPFoxy 资源
- 保持 `http/https` 代理路径不变
- 不改动注册主协议，只增强网络出口解析和适配

### Non-Goals
- 不承诺解决 AWS TES 风控
- 不引入新的长期后台代理守护进程
- 不新增专用代理管理面板

## 🏗️ Architecture

### New Modules

#### `src/services/ipFoxy.ts`
- 负责解析 `ipfoxy://` 代理规范
- 调用 `https://apis.ipfoxy.com/ip/open-api/proxy-list`
- 返回标准化代理记录
- 选择当前第一条可用代理，并转换为标准代理 URL

#### `src/services/socks5Bridge.ts`
- 在本地启动临时 HTTP CONNECT 代理
- 上游使用 SOCKS5 用户名密码认证
- 生命周期绑定到单个 `FetchContext`
- 在 `FetchContext.close()` 时释放本地 server

### Updated Module

#### `src/services/httpClient.ts`
- `createFetchContext` 改为异步
- 先解析原始 `proxyUrl`
- 若是 `ipfoxy://`，先调用 `ipFoxy.ts` 拉取并解析真实代理
- 若最终为 `socks5://`，创建本地 bridge，再把本地 `http://127.0.0.1:<port>` 交给 `ProxyAgent`
- 若最终为 `http/https://`，沿用当前逻辑

## 🔄 Data Flow

### Flow 1: 直接 SOCKS5

1. 用户填写 `socks5://user:pass@host:port`
2. `createFetchContext` 识别为 SOCKS5
3. 启动本地 bridge
4. `undici ProxyAgent` 指向本地 bridge
5. 注册/诊断复用同一个 `FetchContext`

### Flow 2: IPFoxy 自动同步

1. 用户填写 `ipfoxy://<userId>:<proxyKey>`
2. `createFetchContext` 调用 `listIpFoxyProxies`
3. 取列表中的第一条代理
4. 若代理类型为 `socks5`，继续进入 Flow 1
5. 若代理类型为 `http/https`，直接交给 `ProxyAgent`

### Flow 3: 失败场景

1. IPFoxy 接口失败、空列表或字段缺失
2. SOCKS5 握手失败 / 认证失败 / CONNECT 失败
3. 统一通过 `formatErrorDetails` 暴露到诊断和注册日志

## 🧪 Testing Strategy

### Unit Tests
- `ipFoxy.test.ts`
  - `ipfoxy://` 规范解析正确
  - 接口返回列表时能标准化为代理记录
  - 空列表时抛出明确错误
- `httpClient.test.ts`
  - `http/https` 代理保持原逻辑
  - `socks5://` 代理会触发 bridge 路径
  - `ipfoxy://` 代理会先走同步再解析为真实代理

### Regression Tests
- 保持 `registerDiagnostics` 与 `tempmail` 相关测试通过

### Verification
- `node --test` 运行新增与受影响测试
- `npm run typecheck`
- `npm run build`
- 使用用户提供的 IPFoxy 凭据做一次真实链路验证

## 📝 Notes

- 该设计按用户直接授权自动批准并实施。
