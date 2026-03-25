# Kiro Auto Register

自动化注册 AWS Kiro (Amazon Q Developer) 账号，并支持一键导入到 claude-api 账号池管理系统。

## ✨ 核心特性

- 🚀 **全自动注册** - 使用 Playwright 自动化浏览器操作
- 📧 **Tempmail.lol 集成** - 无需配置的临时邮箱服务
- 🔄 **批量注册** - 支持并发批量注册多个账号
- 📤 **一键导入** - 直接导出为 claude-api 兼容格式
- 🌐 **代理支持** - 支持 HTTP/HTTPS 代理
- 💾 **账号管理** - SQLite 数据库持久化存储

## 🚀 快速开始

### 环境要求

- Node.js 18+
- npm 或 yarn

### 安装

```bash
# 安装依赖
npm install

# 安装 Playwright 浏览器
npm run install-browser

# 开发模式运行
npm run dev
```

### 使用

1. 启动应用后访问 http://localhost:3000
2. 点击"开始注册"
3. 等待自动注册完成
4. 导出账号到 claude-api

## 📦 导出格式

支持以下导出格式:

### claude-api 格式
```json
{
  "refreshToken": "xxx",
  "clientId": "xxx",
  "clientSecret": "xxx",
  "provider": "BuilderId"
}
```

## 🛠️ 配置

在 `.env` 文件中配置:

```env
# Tempmail.lol API
TEMPMAIL_BASE_URL=https://api.tempmail.lol/v2

# 代理配置（可选）
PROXY_URL=http://127.0.0.1:7890

# 注册配置
MAX_CONCURRENT=3
TIMEOUT=300
```

## 📝 License

MIT
