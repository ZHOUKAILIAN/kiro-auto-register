export type AccountAuthMethod = 'builder-id' | 'idc';

export interface StoredAccount {
  id: number;
  email: string;
  name?: string;
  region: string;
  authMethod: AccountAuthMethod;
  provider: 'BuilderId';
  ssoToken: string;
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  profileArn: string;
  subscriptionTitle: string;
  usageCurrent: number;
  usageLimit: number;
  accessTokenExpiresAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  proxyUrl: string;
  registerCount: number;
  claudeApiBaseUrl: string;
  claudeApiAdminKey: string;
  cliproxyAuthDir: string;
  autoImportClaude: boolean;
  autoWriteCliproxy: boolean;
}

export interface RegisterOptions {
  count: number;
  proxyUrl?: string;
  autoImportClaude?: boolean;
  autoWriteCliproxy?: boolean;
}

export interface OperationIssue {
  accountId?: number;
  email?: string;
  message: string;
}

export interface RegisterTaskResult {
  index: number;
  success: boolean;
  account?: StoredAccount;
  message: string;
  issues?: OperationIssue[];
}

export interface BatchRegisterResult {
  total: number;
  successCount: number;
  failureCount: number;
  results: RegisterTaskResult[];
}

export interface ClaudeApiImportItem {
  authMethod?: 'IdC';
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  email?: string;
  refreshToken: string;
  region?: string;
}

export interface ClaudeApiDirectImportItem {
  label?: string;
  clientId: string;
  clientSecret: string;
  refreshToken?: string;
  accessToken?: string;
  enabled?: boolean;
  errorCount?: number;
  successCount?: number;
}

export interface CliproxyAuthFile {
  type: 'kiro';
  access_token: string;
  refresh_token: string;
  profile_arn: string;
  expires_at: string;
  auth_method: AccountAuthMethod;
  provider: string;
  last_refresh: string;
  client_id?: string;
  client_secret?: string;
  region?: string;
  email?: string;
}

export interface ClaudeImportResult {
  success: boolean;
  message: string;
  imported: number;
  failed: number;
  duplicate: number;
  raw?: unknown;
}

export interface ClaudeChatProbeResult {
  success: boolean;
  message: string;
  status?: number;
  replyText?: string;
  raw?: unknown;
}

export interface CliproxyWriteResult {
  success: boolean;
  message: string;
  written: string[];
  failed: OperationIssue[];
}
