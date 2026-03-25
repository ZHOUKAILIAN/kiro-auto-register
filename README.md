# Kiro Auto Register

桌面化的 Kiro 自动注册工作台，支持：

- 纯 HTTP + Tempmail 完成 BuilderId 注册编排
- 注册成功后继续通过 AWS OIDC / Kiro API 兑换完整凭证
- 本地保存 `ssoToken / accessToken / refreshToken / clientId / clientSecret`
- 直接导入 `claude-api`
- 生成并写入 `cliproxyapi` 的 Kiro auth 文件
- 对本地 `claude-api` 发起真实聊天探针验证

## 核心能力

- 自动注册：创建临时邮箱、走 AWS 接口链路、收取验证码、拿到 SSO Token
- 邮箱稳态：借鉴 `cnlimiter/codex-manager` 的 OTP 处理思路，过滤历史邮件并对 Tempmail 短暂异常做重试
- 凭证补全：把 SSO Token 兑换成可落地的 BuilderId / Kiro 凭证
- 账号工作台：查看账号列表、筛选目标、批量删除、导出 JSON
- claude-api 集成：调用 `/v2/accounts/import-by-token` 直接导入
- claude-api 兼容：优先适配 [kkddytd/claude-api](https://github.com/kkddytd/claude-api)，必要时自动回退到 `/v2/accounts/import`
- claude-api 探针：调用 `/v2/test/chat/completions` 做真实请求验证
- cliproxyapi 集成：按其 Kiro provider 文件规范写入 auth 目录

## 安装

```bash
npm install --legacy-peer-deps
```

说明：

- 当前依赖树里 `vite` 与 `electron-vite` 存在 peer 版本差异，所以安装时需要 `--legacy-peer-deps`
- 当前主链路已经切换为纯接口注册

## 开发与构建

```bash
npm run dev
npm run typecheck
npm run build
```

## 使用流程

1. 启动应用后，在控制台设置里填写注册数量、代理、claude-api 地址/口令、cliproxy auth 目录
2. 点击“开始注册”
3. 应用会自动完成注册，并尝试把 `ssoToken` 兑换为完整凭证
4. 可选择：
   - 导出 JSON
   - 导入 claude-api
   - 验证 claude-api
   - 同步 cliproxyapi

## 当前实测状态

- 2026-03-25 在当前中国大陆出口环境下，`tempmail.lol` 直接创建邮箱会返回 `403`，响应包含 `captcha_required: true`
- 为了继续验证链路，代码支持通过 `TEMPMAIL_REUSE_EMAIL` / `TEMPMAIL_REUSE_TOKEN` 复用已有邮箱
- 2026-03-25 纯接口注册已稳定推进到 `POST https://profile.aws.amazon.com/api/send-otp`
- 当前环境该步骤真实返回 `400 {"errorCode":"BLOCKED","message":"Request was blocked by TES."}`
- 本地 `claude-api` 探针已接通；当账号池为空时，`/v2/test/chat/completions` 会返回 `503 {"error":"无可用账号，请先添加并配置账号"}`

这意味着仓库内的纯接口链路、导入逻辑和探针验证都已经落地，但在当前环境里，最终注册成功仍受 AWS 风控和邮箱供应商地域限制影响。若要真正拿到新账号并打通最终请求，通常需要可用的非 CN 代理或其他能通过风控的运行环境。

详细现状、阻塞点、所需解决条件和启动方式见：

- [docs/analysis/20260325-api-only-current-status.md](./docs/analysis/20260325-api-only-current-status.md)

## claude-api 配置

- 默认地址：`http://127.0.0.1:62311`
- 默认管理口令：`admin`
- 导入接口：`POST /v2/accounts/import-by-token`

优先发送 token import 格式：

```json
[
  {
    "authMethod": "IdC",
    "accessToken": "xxx",
    "clientId": "xxx",
    "clientSecret": "xxx",
    "email": "user@example.com",
    "refreshToken": "xxx",
    "region": "us-east-1"
  }
]
```

兼容策略：

- 先调用 `POST /v2/accounts/import-by-token`
- 如果目标版本不支持该端点，则自动回退 `POST /v2/accounts/import`

## cliproxyapi 配置

应用会在你指定的 auth 目录里写入类似下面的文件：

```json
{
  "type": "kiro",
  "access_token": "xxx",
  "refresh_token": "xxx",
  "profile_arn": "",
  "expires_at": "2026-12-31T16:00:00.000Z",
  "auth_method": "builder-id",
  "provider": "BuilderId",
  "last_refresh": "2026-03-25T12:00:00.000Z",
  "client_id": "xxx",
  "client_secret": "xxx",
  "region": "us-east-1",
  "email": "user@example.com"
}
```

## 验证

已验证命令：

```bash
node --test --experimental-strip-types src/services/accountFormats.test.ts
node --test --experimental-strip-types src/services/storeSchemas.test.ts
node --test --experimental-strip-types src/services/httpClient.test.ts src/services/fingerprintRuntime.test.ts src/services/kiroApiRegister.test.ts src/services/tempmail.test.ts src/services/kiroRegister.test.ts src/services/targetIntegrations.test.ts src/services/accountFormats.test.ts src/services/storeSchemas.test.ts
npm run typecheck
```
