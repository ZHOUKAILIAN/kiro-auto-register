# 安装和使用指南

## 🚀 快速开始

### 1. 安装依赖

```bash
cd ~/Desktop/mySelf/kiro-auto-register
npm install --legacy-peer-deps
```

### 2. 启动应用

```bash
npm run dev
```

## 📦 项目结构

```
kiro-auto-register/
├── src/
│   ├── main/                 # Electron 主进程
│   │   └── index.ts
│   ├── preload/              # 预加载脚本
│   │   └── index.ts
│   ├── renderer/             # React 前端
│   │   ├── index.html
│   │   └── src/
│   │       ├── App.tsx       # 主应用组件
│   │       ├── App.css       # 样式文件
│   │       └── main.tsx      # 入口文件
│   └── services/             # 核心服务
│       ├── tempmail.ts       # 临时邮箱服务
│       ├── kiroRegister.ts   # 注册服务
│       └── exporter.ts       # 导出服务
├── resources/                # 应用资源
├── package.json
└── electron.vite.config.ts   # Vite 配置
```

## 🎨 界面功能

### 主界面
- **开始注册**: 点击按钮开始自动注册流程
- **账号列表**: 显示所有已注册的账号
- **批量操作**: 支持批量删除账号
- **导出功能**: 导出为 claude-api 兼容格式
- **设置面板**: 配置代理等选项

### 注册流程
1. 自动创建临时邮箱 (Tempmail.lol)
2. 调用 AWS Kiro / Builder ID 相关 API
3. 自动获取邮箱验证码
4. 完成注册并获取 SSO Token
5. 保存账号信息到本地数据库

### 账号管理
- **查看**: 显示所有账号详情
- **删除**: 单个或批量删除
- **导出**: 导出为 JSON 格式
- **选择**: 复选框多选账号

## ⚙️ 配置说明

### 代理设置
如果 Tempmail.lol 在你的地区被限制，可以配置代理：

1. 点击"设置"按钮
2. 输入代理 URL（例如：`http://127.0.0.1:7890`）
3. 点击"保存设置"

### 数据存储
账号数据使用 electron-store 存储在本地：
- macOS: `~/Library/Application Support/kiro-auto-register/`
- Windows: `%APPDATA%/kiro-auto-register/`
- Linux: `~/.config/kiro-auto-register/`

## 📤 导出到 claude-api

### 导出格式
```json
[
  {
    "refreshToken": "xxx",
    "provider": "BuilderId",
    "email": "xxx@tempmail.lol",
    "name": "John Smith"
  }
]
```

### 导入步骤
1. 点击"导出账号"按钮，下载 JSON 文件
2. 确保 claude-api 服务运行中（http://localhost:62311）
3. 访问 claude-api 管理界面
4. 进入"账号管理" → "批量添加"
5. 上传或粘贴 JSON 内容
6. 点击"导入"

## 🛠️ 开发命令

```bash
# 开发模式（热重载）
npm run dev

# 类型检查
npm run typecheck

# 构建应用
npm run build

# 预览构建结果
npm start
```

## 🐛 常见问题

### Q1: npm install 失败
**A**: 确保使用 Node.js 18+ 版本
```bash
node --version  # 检查版本
```

### Q2: Tempmail.lol 返回错误
**A**: 配置代理或使用 VPN

### Q3: 界面无法加载
**A**: 清除缓存重启
```bash
rm -rf node_modules
npm install --legacy-peer-deps
npm run dev
```

### Q4: 注册一直卡住
**A**: 检查网络连接和代理设置

## 📊 技术栈

- **Electron**: 38.x（桌面应用框架）
- **React**: 18.x（前端 UI）
- **TypeScript**: 5.x（类型安全）
- **Undici / fetch**: HTTP 请求与代理支持
- **Vite**: 6.x（构建工具）
- **electron-store**: 11.x（数据持久化）

## 🔒 安全说明

- 所有数据存储在本地
- 不会上传任何信息到云端
- 代理配置仅用于注册过程
- 建议定期备份账号数据

## 📝 更新日志

### v1.0.0 (2026-03-25)
- ✅ 完整的 Electron + React 前端
- ✅ Tempmail.lol 集成
- ✅ 自动化注册流程
- ✅ 账号管理功能
- ✅ claude-api 格式导出
- ✅ 代理配置支持

## 📞 获取帮助

- GitHub Issues: https://github.com/ZHOUKAILIAN/kiro-auto-register/issues
- 项目文档: 查看 README.md 和 USAGE.md
