import type { AppSettings, StoredAccount } from '../shared/contracts.ts';

export const DEFAULT_SETTINGS: AppSettings = {
  proxyUrl: '',
  registerCount: 1,
  claudeApiBaseUrl: 'http://127.0.0.1:62311',
  claudeApiAdminKey: 'admin',
  cliproxyAuthDir: '',
  autoImportClaude: false,
  autoWriteCliproxy: false
};

function readString(value: unknown, fallback: string = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readPositiveInteger(value: unknown, fallback: number): number {
  const parsed = readNumber(value, fallback);
  return parsed > 0 ? Math.floor(parsed) : fallback;
}

export function normalizeSettings(input: unknown): AppSettings {
  const settings = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;

  return {
    proxyUrl: readString(settings.proxyUrl, DEFAULT_SETTINGS.proxyUrl),
    registerCount: readPositiveInteger(settings.registerCount, DEFAULT_SETTINGS.registerCount),
    claudeApiBaseUrl: readString(settings.claudeApiBaseUrl, DEFAULT_SETTINGS.claudeApiBaseUrl),
    claudeApiAdminKey: readString(settings.claudeApiAdminKey, DEFAULT_SETTINGS.claudeApiAdminKey),
    cliproxyAuthDir: readString(settings.cliproxyAuthDir, DEFAULT_SETTINGS.cliproxyAuthDir),
    autoImportClaude: readBoolean(settings.autoImportClaude, DEFAULT_SETTINGS.autoImportClaude),
    autoWriteCliproxy: readBoolean(settings.autoWriteCliproxy, DEFAULT_SETTINGS.autoWriteCliproxy)
  };
}

export function normalizeAccountRecord(input: unknown): StoredAccount {
  const record = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const createdAt = readNumber(record.createdAt, Date.now());
  const updatedAt = readNumber(record.updatedAt, createdAt);

  return {
    id: readNumber(record.id, Date.now()),
    email: readString(record.email),
    name: readString(record.name) || undefined,
    region: readString(record.region, 'us-east-1'),
    authMethod: readString(record.authMethod, 'builder-id') as StoredAccount['authMethod'],
    provider: 'BuilderId',
    ssoToken: readString(record.ssoToken),
    accessToken: readString(record.accessToken),
    refreshToken: readString(record.refreshToken),
    clientId: readString(record.clientId),
    clientSecret: readString(record.clientSecret),
    profileArn: readString(record.profileArn),
    subscriptionTitle: readString(record.subscriptionTitle),
    usageCurrent: readNumber(record.usageCurrent, 0),
    usageLimit: readNumber(record.usageLimit, 0),
    accessTokenExpiresAt: readNumber(record.accessTokenExpiresAt, 0),
    createdAt,
    updatedAt
  };
}
