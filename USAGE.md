# 使用指南

## 📝 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/ZHOUKAILIAN/kiro-auto-register.git
cd kiro-auto-register
```

### 2. 安装依赖

```bash
npm install
npm run install-browser
```

### 3. 配置环境变量（可选）

```bash
cp .env.example .env
# 编辑 .env 文件，配置代理等
```

### 4. 运行注册

```bash
npm run dev
```

## 🎯 核心功能说明

### 自动注册流程

1. **创建临时邮箱** - 使用 Tempmail.lol API 自动创建
2. **访问 AWS 注册页面** - Playwright 自动化浏览器
3. **填写注册信息** - 自动生成随机姓名
4. **获取验证码** - 自动从临时邮箱读取
5. **完成注册** - 获取 SSO Token

### 导出到 claude-api

注册成功后，可以通过以下方式导出:

#### 方式一: JSON 文件导出

```typescript
import { exportToFile } from './src/services/exporter';

// 导出所有账号
exportToFile(accounts, 'kiro-accounts.json');
```

#### 方式二: 直接复制 JSON

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

## 🔧 高级配置

### 使用代理

在 `.env` 文件中配置:

```env
PROXY_URL=http://127.0.0.1:7890
```

或在代码中传入:

```typescript
await autoRegister(onProgress, 'http://127.0.0.1:7890');
```

### 批量注册

```typescript
const results = [];
for (let i = 0; i < 5; i++) {
  const result = await autoRegister((msg) => {
    console.log(`[任务${i+1}] ${msg}`);
  });
  if (result.success) {
    results.push(result);
  }
  await new Promise(r => setTimeout(r, 5000)); // 间隔5秒
}
```

### 自定义密码

修改 `src/services/kiroRegister.ts` 中的 `DEFAULT_PASSWORD`:

```typescript
const DEFAULT_PASSWORD = 'YourCustomPassword123!';
```

## 📤 导入到 claude-api

### 步骤

1. 确保 claude-api 服务正在运行:
   ```bash
   cd ../claude-api
   ./claude-server
   ```

2. 访问 http://localhost:62311

3. 登录（密码: admin）

4. 进入"账号管理" -> "批量添加"

5. 粘贴导出的 JSON 数据:
   ```json
   [
     {
       "refreshToken": "xxx",
       "provider": "BuilderId",
       "email": "xxx@tempmail.lol"
     }
   ]
   ```

6. 点击"导入"

### 验证导入

导入后，在账号列表中应该能看到新账号:
- 邮箱地址
- 认证方式: BuilderId
- 状态: 可用

## ⚠️ 注意事项

### Tempmail.lol 限制

- 中国大陆 IP 可能被限制，需要使用代理
- 邮箱有效期约 10-15 分钟
- 建议注册完成后立即导入到 claude-api

### 注册成功率

- 单次注册成功率约 80-90%
- 主要失败原因：
  - 验证码未收到（邮箱过期）
  - AWS 服务器错误
  - 网络超时

### 安全建议

- 不要在公共网络使用
- 定期更换代理
- 避免短时间大量注册

## 🐛 常见问题

### Q: Tempmail.lol 返回 403

A: 使用代理访问，或订阅 TempMail Plus/Ultra

### Q: 验证码一直收不到

A:
1. 检查邮箱是否过期
2. 延长超时时间
3. 重新创建邮箱重试

### Q: 导入到 claude-api 失败

A:
1. 检查 JSON 格式是否正确
2. 确保 refreshToken 字段存在
3. 检查 claude-api 服务状态

### Q: 浏览器一直卡住

A:
1. 关闭无头模式方便调试
2. 检查网络连接
3. 增加超时时间
