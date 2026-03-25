# 项目信息

## 🎉 项目创建成功!

**GitHub 仓库**: https://github.com/ZHOUKAILIAN/kiro-auto-register
**状态**: 私有仓库 (Private)

## 📦 项目结构

**本地路径**: `~/Desktop/mySelf/kiro-auto-register`

```
kiro-auto-register/
├── src/
│   └── services/
│       ├── tempmail.ts       # Tempmail.lol 邮箱服务
│       ├── kiroRegister.ts   # Kiro 自动注册核心逻辑
│       └── exporter.ts       # 导出到 claude-api 格式
├── README.md                 # 项目说明
├── USAGE.md                  # 使用指南
├── LICENSE                   # MIT 许可证
├── package.json              # 项目配置
├── tsconfig.json             # TypeScript 配置
├── .env.example              # 环境变量示例
└── .gitignore                # Git 忽略规则
```

## ✨ 核心特性

### 1. Tempmail.lol 集成 ✅
- 基于 API v2
- 自动创建临时邮箱
- 自动获取 AWS 验证码
- 智能邮件过滤和验证码提取

### 2. Kiro 自动注册 ✅
- Playwright 浏览器自动化
- 完整注册流程自动化
- 随机姓名生成
- 支持代理配置
- 获取 SSO Token

### 3. claude-api 导出 ✅
- 标准 JSON 格式
- 批量导出支持
- 一键导入到 claude-api
- 完整的导入说明

## 🚀 快速开始

### 克隆仓库

```bash
git clone https://github.com/ZHOUKAILIAN/kiro-auto-register.git
cd kiro-auto-register
```

### 安装依赖

```bash
npm install
npm run install-browser
```

### 运行

```bash
npm run dev
```

## 📋 待完成任务

### 必须完成
- [ ] 实现 Electron 主进程代码
- [ ] 创建 UI 界面（React/Vue）
- [ ] 实现账号数据库存储
- [ ] 添加批量注册功能

### 建议完成
- [ ] 添加代理池管理
- [ ] 实现任务队列
- [ ] 添加日志系统
- [ ] 创建 GitHub Actions 自动构建
- [ ] 添加单元测试

## 🔗 相关项目

### claude-api
- **路径**: `/Users/zhoukailian/claude-api`
- **端口**: 62311
- **默认密码**: admin
- **功能**: Kiro 账号池管理系统

### Kiro-auto-register (参考项目)
- **路径**: `/Users/zhoukailian/Kiro-auto-register`
- **技术**: Electron + Playwright
- **功能**: Outlook 邮箱 + OIDC 认证

### codex-manager (参考项目)
- **路径**: `/Users/zhoukailian/codex-manager`
- **技术**: Python + FastAPI
- **功能**: OpenAI 账号注册（Tempmail.lol）

## 📝 开发日志

### 2026-03-25
- ✅ 创建 GitHub 私有仓库
- ✅ 集成 Tempmail.lol API
- ✅ 实现 Kiro 自动注册核心逻辑
- ✅ 实现 claude-api 导出功能
- ✅ 编写完整文档
- ✅ 移动到 mySelf 文件夹

## 🎯 下一步计划

1. **完善 UI 界面**
   - 账号列表展示
   - 注册进度显示
   - 导出功能按钮

2. **增强稳定性**
   - 错误重试机制
   - 超时处理
   - 日志记录

3. **优化性能**
   - 并发注册
   - 代理池轮换
   - 资源管理

## 💡 技术亮点

### Tempmail.lol 实现
- 从 codex-manager 移植
- 完整的时间戳处理
- 邮件去重机制
- OTP 时间锚点过滤

### Playwright 自动化
- 浏览器指纹隐藏
- 动态元素等待
- Cookie 管理
- 代理支持

### 导出格式兼容
- claude-api 标准格式
- 支持批量导出
- 完整的字段映射

## 🔒 安全说明

- 私有仓库，仅限个人使用
- 不要公开分享账号信息
- 建议使用代理访问
- 定期更新依赖

## 📞 支持

如有问题，请在仓库中创建 Issue。

---

**创建时间**: 2026-03-25
**作者**: ZHOUKAILIAN
**许可证**: MIT
