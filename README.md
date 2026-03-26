# Kiro Manager

桌面化的 Kiro 注册工作台，聚焦三件事：

- 纯 HTTP + Tempmail 完成 BuilderId 注册编排
- 注册成功后继续通过 AWS OIDC / Kiro API 兑换完整凭证
- 本地保存账号并按需导出标准 JSON

同时保留：

- 手动 OTP 回退
- 代理链路诊断
- 本地账号池管理与批量删除

## 核心能力

- 自动注册：创建临时邮箱、走 AWS 接口链路、收取验证码、拿到 SSO Token
- 邮箱稳态：过滤历史邮件并对 Tempmail 短暂异常做重试
- 凭证补全：把 SSO Token 兑换成可落地的 BuilderId / Kiro 凭证
- 账号工作台：查看账号列表、勾选目标、批量删除、导出 JSON
- OTP 回退：支持用户在 UI 中手动提交验证码继续当前任务
- 链路诊断：查看当前出口 IP、`tempmail` 创建结果和最近一次 AWS 阻塞摘要

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

1. 启动应用后，在控制台设置里填写注册数量、代理、邮箱来源和 OTP 模式
2. 点击“运行诊断”确认当前出口 IP、`tempmail` 可用性和最近一次 AWS 阻塞摘要
3. 点击“开始注册”
4. 应用会自动完成注册，并尝试把 `ssoToken` 兑换为完整凭证
5. 如果当前链路进入手动 OTP 回退，界面会显示待输入验证码卡片，提交 6 位 OTP 后继续执行
6. 注册完成后，可在账号池里勾选并导出 JSON

## 导出格式

导出结果保留当前兼容字段，示例：

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

## 当前实测状态

- 2026-03-25 在中国大陆出口环境下，`tempmail.lol` 直接创建邮箱会返回 `403`，响应包含 `captcha_required: true`
- 2026-03-25 切到当前 TUN 出口后，`curl https://ipinfo.io/json` 识别到的出口为日本东京（`31.223.184.111`, G-Core Labs）
- 同一出口下，`POST https://api.tempmail.lol/v2/inbox/create` 已可稳定返回 `201`
- 为了继续验证链路，代码仍支持通过 `TEMPMAIL_REUSE_EMAIL` / `TEMPMAIL_REUSE_TOKEN` 复用已有邮箱
- 2026-03-25 纯接口注册与浏览器真实路径都推进到 `POST https://profile.aws.amazon.com/api/send-otp`
- 当前环境该步骤真实返回 `400 {"errorCode":"BLOCKED","message":"Request was blocked by TES."}`
- 已连续验证多个 `tempmail` 域名（如 `cloudvxz.com`、`moonairse.com`、`hush2u.com`），结果都在 `send-otp` 被 TES 拦截
- 2026-03-25 已补上 `custom email + manual OTP` 回退链路，支持在应用内继续提交验证码并恢复任务
- 2026-03-25 已补上“运行诊断”，可直接查看当前代理出口、`tempmail` 创建结果和最近一次 AWS 阶段阻塞

这意味着仓库内的纯接口链路、OTP 回退、诊断和导出能力都已经落地，但当前真实阻塞点已经收敛为 AWS TES 风控，而不再只是 `tempmail` 的地域限制。若要真正拿到新账号，通常还需要更可信的海外运行环境、不同的邮箱来源，或两者同时满足。

详细现状、阻塞点和所需解决条件见：

- [docs/analysis/20260325-api-only-current-status.md](./docs/analysis/20260325-api-only-current-status.md)

## 验证

本轮相关验证命令：

```bash
node --test src/services/storeSchemas.test.ts src/services/accountFormats.test.ts src/shared/accountActionUi.test.ts
npm run typecheck
npm run build
```
