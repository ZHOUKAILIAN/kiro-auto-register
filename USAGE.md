# 使用指南

## 1. 启动应用

```bash
npm install --legacy-peer-deps
npm run dev
```

## 2. 配置控制台

应用顶部的控制台支持以下配置：

- 注册数量：一次顺序执行多少个注册任务
- 代理 URL：需要翻墙时填写
- claude-api 地址：例如 `http://127.0.0.1:62311`
- claude-api 管理口令：默认通常是 `admin`
- cliproxyapi auth 目录：选择 `~/.cli-proxy-api` 或挂载目录
- 自动导入开关：
  - 注册成功后自动导入 claude-api
  - 注册成功后自动写入 cliproxy auth 文件

## 3. 开始注册

点击“开始注册”后，系统会：

1. 创建临时邮箱
2. 走 AWS / Builder ID 的纯接口注册链路
3. 读取 `x-amz-sso_authn`
4. 通过 AWS OIDC / SSO portal 兑换 `accessToken / refreshToken / clientId / clientSecret`
5. 拉取用户邮箱、订阅和基础用量
6. 保存到本地账号池

右侧日志面板会实时显示每个阶段的输出。

补充说明：

- 当前临时邮箱优先使用 `Tempmail.lol`
- 验证码轮询已加入 OTP 时间锚点过滤，避免历史邮件干扰本次注册
- 当前环境如果直接创建 `tempmail.lol` 邮箱失败，可通过 `TEMPMAIL_REUSE_EMAIL` / `TEMPMAIL_REUSE_TOKEN` 复用已有邮箱
- 当前中国大陆出口环境实测在 AWS `profile /send-otp` 阶段可能被 TES 风控拦截，建议优先配置可用代理

## 4. 导入到 claude-api

配置好地址和口令后：

- 不选账号：导入全部本地账号
- 勾选账号：只导入勾选项

点击“导入 claude-api”后，应用会调用：

```bash
POST /v2/accounts/import-by-token
Authorization: Bearer <admin-password>
```

如果目标版本不支持该接口，应用会自动回退到：

```bash
POST /v2/accounts/import
Authorization: Bearer <admin-password>
```

## 5. 验证 claude-api 请求

点击“验证 claude-api”后，应用会调用：

```bash
POST /v2/test/chat/completions
Authorization: Bearer <admin-password>
```

如果本地账号池为空，典型返回是：

```json
{"error":"无可用账号，请先添加并配置账号"}
```

## 6. 同步到 cliproxyapi

配置好 auth 目录后：

- 不选账号：同步全部本地账号
- 勾选账号：只同步勾选项

点击“同步 cliproxyapi”后，应用会为每个账号写入一个 `kiro-*.json` 文件。

## 7. 导出 JSON

点击“导出 JSON”会下载当前账号的 claude-api 导入 payload，适合手工备份或跨机器迁移。

## 8. 删除账号

- “删除选中”会批量删除勾选账号
- 表格最后一列支持删除单个账号

## 常见问题

### 安装时报 peer 依赖冲突

使用：

```bash
npm install --legacy-peer-deps
```

### 注册成功但凭证未补全

说明纯接口注册已部分成功，但 AWS / Kiro 凭证兑换阶段失败。账号仍会保存在本地，但不会处于“可导入”状态，建议根据日志重试。

### 同步 cliproxyapi 失败

优先检查：

- auth 目录是否存在
- 是否有写权限
- 账号是否已经补全 `accessToken` 和 `refreshToken`
