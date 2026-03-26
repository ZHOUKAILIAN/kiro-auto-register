# 项目信息

## 🎉 项目创建成功!

**GitHub 仓库**: https://github.com/ZHOUKAILIAN/kiro-manager
**状态**: 私有仓库 (Private)

> 当前产品定位已经收敛为“注册 + 本地账号池 + 导出工作台”。下文若提到外部仓库集成，多为历史里程碑记录，不代表当前 UI 仍会直接暴露这些入口。

## 📦 项目结构

**本地路径**: `~/Desktop/mySelf/kiro-manager`

```
kiro-manager/
├── src/
│   ├── main/                 # Electron 主进程与 IPC
│   ├── preload/              # Preload bridge
│   ├── renderer/             # React UI 工作台
│   ├── services/             # 核心服务与测试
│   └── shared/               # 前后端共享类型
├── docs/                     # requirements / design / analysis / standards
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
- 纯 HTTP / API 注册编排
- 完整注册流程自动化
- 随机姓名生成
- 支持代理配置
- 获取 SSO Token

### 3. 标准账号导出 ✅
- 标准 JSON 格式
- 批量导出支持
- 兼容既有消费方的数据结构
- 当前应用不再直接承担外部仓库导入控制台职责

### 4. 手动 OTP 回退与链路诊断 ✅
- 自定义邮箱 + 手动 OTP 输入
- 渲染进程重载后恢复待输入验证码状态
- 一键查看出口 IP / `tempmail` / AWS 最近阻塞摘要

## 🚀 快速开始

### 克隆仓库

```bash
git clone https://github.com/ZHOUKAILIAN/kiro-manager.git
cd kiro-manager
```

### 安装依赖

```bash
npm install --legacy-peer-deps
```

### 运行

```bash
npm run dev
```

## 📋 待完成任务

### 当前阻塞项
- [ ] 找到能通过 AWS TES 风控的运行条件
- [ ] 验证 `新注册账号 -> 凭证兑换 -> 导入 claude-api -> chat probe` 全链路
- [ ] 实现自带邮箱 IMAP / POP3 自动收码，替代手动 OTP

### 下一批工程项
- [x] 统一仓库内主要文档与展示名称到 `kiro-manager`
- [x] 根据真实验证结果更新 requirement / design / analysis 文档
- [ ] 补充可复用的外部链路诊断脚本
- [ ] 创建 GitHub Actions 自动构建

## 🔗 相关项目

### claude-api
- **路径**: `/Users/zhoukailian/claude-api`
- **端口**: 62311
- **默认密码**: admin
- **功能**: Kiro 账号池管理系统

### Kiro-auto-register (参考项目)
- **路径**: `/Users/zhoukailian/Kiro-auto-register`
- **技术**: Electron + API workflow
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
- ✅ 将 GitHub 仓库重命名为 `kiro-manager`
- ✅ 验证当前 TUN 出口可正常创建 `tempmail.lol` 邮箱
- ✅ 验证纯 API 与浏览器路径都会在 `profile /send-otp` 遇到 AWS TES 拦截
- ✅ 交付手动 OTP 回退能力与内置链路诊断

## 🎯 下一步计划

1. **解决真实链路阻塞**
   - 找到能通过 AWS TES 的网络 / 邮箱组合
   - 继续推进到验证码送达与身份创建
   - 完成首条成功导入 `claude-api` 的真实链路

2. **收敛文档与命名**
   - 继续清理兼容层里残留的 `kiro-auto-register` 内部标识
   - 保留现有本地数据目录兼容性，避免因内部包名切换丢失历史设置

3. **补充工程化验证**
   - 固化外部阻塞点诊断脚本
   - 增加回归验证命令与结果记录

## 💡 技术亮点

### Tempmail.lol 实现
- 从 codex-manager 移植
- 完整的时间戳处理
- 邮件去重机制
- OTP 时间锚点过滤

### API 注册链路
- 指纹脚本仿真
- HTTP Cookie 管理
- OTP 邮件轮询
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
