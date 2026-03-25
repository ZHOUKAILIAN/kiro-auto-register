# API Only Current Status

**Date**: 2026-03-25
**Status**: Active

## 当前状态

- 仓库注册执行层已经完全切换到纯 API 路径
- 界面点击“开始注册”会进入 Electron 主进程，然后调用 `src/services/kiroRegister.ts -> autoRegisterViaApi()`
- 浏览器注册相关依赖、安装脚本和辅助函数已经移除
- `claude-api` 导入和 `/v2/test/chat/completions` 探针已经接入 UI 和主流程

## 当前问题

### 1. tempmail.lol 地域限制
- 当前中国大陆出口环境直接调用 `POST https://api.tempmail.lol/v2/inbox/create`
- 实测返回：`403 {"error":"The country you are requesting from (CN) is not allowed...","captcha_required":true}`
- 当前可行绕过方式：通过 `TEMPMAIL_REUSE_EMAIL` / `TEMPMAIL_REUSE_TOKEN` 复用已有邮箱继续调试

### 2. AWS TES 风控拦截
- 纯 API 注册目前可稳定推进到 `POST https://profile.aws.amazon.com/api/send-otp`
- 实测返回：`400 {"errorCode":"BLOCKED","message":"Request was blocked by TES."}`
- 这说明当前阻塞点不在 Electron、UI、IPC 或导入链路，而在外部平台风控

### 3. claude-api 当前没有可用账号
- 本地 `claude-api` 地址：`http://127.0.0.1:62311`
- 管理口令：`admin`
- `GET /v2/accounts` 实测为 0 个账号
- `POST /v2/test/chat/completions` 当前返回：`503 {"error":"无可用账号，请先添加并配置账号"}`

## 还需要什么解决方式

要真正完成“新注册账号 -> 导入 claude-api -> 成功聊天请求”这条链路，还需要下面至少一项：

- 可用的非 CN 代理或海外运行环境，用来通过 `tempmail.lol` 地域限制
- 能通过 AWS TES 风控的网络环境或请求画像
- 一个已可用的 Builder ID / Kiro 账号，用来单独验证导入和 `claude-api` 请求链路

当前仓库内部已经没有浏览器注册依赖，剩余问题主要是外部服务限制，不是界面点击路径问题。

## 仓库怎么启动

### 安装

```bash
cd /Users/zhoukailian/Desktop/mySelf/kiro-auto-register
npm install --legacy-peer-deps
```

### 开发启动

```bash
npm run dev
```

### 其他常用命令

```bash
npm run typecheck
npm run build
```

## 典型使用顺序

1. 启动应用
2. 在界面设置 `claude-api` 地址和口令、代理 URL
3. 点击“开始注册”
4. 如果已有账号，可点击“导入 claude-api”或“验证 claude-api”

## 已验证结果

- `npm run typecheck` 通过
- `npm run build` 通过
- `node --test --experimental-strip-types src/services/httpClient.test.ts src/services/fingerprintRuntime.test.ts src/services/kiroApiRegister.test.ts src/services/tempmail.test.ts src/services/kiroRegister.test.ts src/services/targetIntegrations.test.ts src/services/accountFormats.test.ts src/services/storeSchemas.test.ts` 通过
