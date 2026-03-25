/**
 * 导出服务 - 将账号导出为 claude-api 兼容格式
 */

export interface KiroAccount {
  id?: number;
  email: string;
  ssoToken: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  name?: string;
  createdAt: number;
}

export interface ClaudeApiAccount {
  refreshToken: string;
  clientId?: string;
  clientSecret?: string;
  provider: string;
  email?: string;
  name?: string;
}

/**
 * 转换为 claude-api 格式
 */
export function toClaudeApiFormat(account: KiroAccount): ClaudeApiAccount {
  return {
    refreshToken: account.ssoToken || account.refreshToken || '',
    clientId: account.clientId,
    clientSecret: account.clientSecret,
    provider: 'BuilderId',
    email: account.email,
    name: account.name
  };
}

/**
 * 批量转换
 */
export function batchToClaudeApiFormat(accounts: KiroAccount[]): ClaudeApiAccount[] {
  return accounts.map(toClaudeApiFormat);
}

/**
 * 导出为 JSON 字符串
 */
export function exportToJson(accounts: KiroAccount[], pretty: boolean = true): string {
  const claudeAccounts = batchToClaudeApiFormat(accounts);
  return JSON.stringify(claudeAccounts, null, pretty ? 2 : 0);
}

/**
 * 导出为文件
 */
export function exportToFile(accounts: KiroAccount[], filename: string): void {
  const json = exportToJson(accounts);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

/**
 * 生成导入说明
 */
export function generateImportInstructions(): string {
  return `
# 导入到 claude-api 的步骤

## 方式一：通过 Web 控制台导入

1. 访问 claude-api Web 控制台: http://localhost:62311
2. 使用密码 "admin" 登录
3. 点击 "账号管理" -> "批量导入"
4. 上传导出的 JSON 文件
5. 点击 "导入" 完成

## 方式二：直接批量添加

将以下内容复制到 claude-api 的批量添加界面:

\`\`\`json
[导出的账号列表]
\`\`\`

## 格式说明

每个账号包含以下字段:
- refreshToken: SSO Token (必填)
- clientId: OIDC 客户端 ID (可选)
- clientSecret: OIDC 客户端密钥 (可选)
- provider: 认证提供商 (默认: BuilderId)
- email: 邮箱地址
- name: 用户姓名

## 注意事项

- 导入前确保 claude-api 服务正在运行
- 建议先测试单个账号导入
- 定期备份账号数据
`;
}
