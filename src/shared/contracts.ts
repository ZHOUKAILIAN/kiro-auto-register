export type AccountAuthMethod = 'builder-id' | 'idc';
export type RegistrationEmailMode = 'tempmail' | 'custom';
export type OtpMode = 'tempmail' | 'manual' | 'mailbox';

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
  registrationEmailMode: RegistrationEmailMode;
  customEmailAddress: string;
  otpMode: OtpMode;
  customMailboxHost: string;
  customMailboxPort: number;
  customMailboxUsername: string;
  customMailboxPassword: string;
  customMailboxTls: boolean;
}

export interface RegisterOptions {
  count: number;
  proxyUrl?: string;
  registrationEmailMode?: RegistrationEmailMode;
  customEmailAddress?: string;
  otpMode?: OtpMode;
}

export interface TargetIntegrationSettings {
  claudeApiBaseUrl: string;
  claudeApiAdminKey: string;
  cliproxyAuthDir: string;
}

export interface PendingOtpState {
  taskId: string;
  registerIndex: number;
  email: string;
  requestedAt: number;
  source: 'manual';
}

export interface RegistrationFailureSummary {
  stage: string;
  message: string;
  timestamp: number;
}

export interface RegisterDiagnostics {
  executedAt: number;
  proxyUrl?: string;
  egress?: {
    ip?: string;
    city?: string;
    region?: string;
    country?: string;
    org?: string;
  };
  tempmail: {
    success: boolean;
    message: string;
    email?: string;
  };
  aws?: {
    stage: string;
    message: string;
  };
}

export interface RegisterRuntimeState {
  isRegistering: boolean;
  pendingOtp?: PendingOtpState;
  latestDiagnostics?: RegisterDiagnostics;
  lastFailure?: RegistrationFailureSummary;
}

export interface ManualOtpSubmitResult {
  success: boolean;
  message: string;
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
