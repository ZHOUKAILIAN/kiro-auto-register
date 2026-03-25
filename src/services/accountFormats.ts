import type {
  ClaudeApiDirectImportItem,
  ClaudeApiImportItem,
  CliproxyAuthFile,
  StoredAccount
} from '../shared/contracts.ts';

function sanitizeEmailForFilename(email: string): string {
  return email.trim().toLowerCase().replace(/[@.]/g, '-');
}

export function buildClaudeApiImportPayload(accounts: StoredAccount[]): ClaudeApiImportItem[] {
  return accounts
    .filter((account) => account.refreshToken.trim() !== '')
    .map((account) => {
      if (account.clientId.trim() !== '' && account.clientSecret.trim() !== '') {
        return {
          authMethod: 'IdC',
          accessToken: account.accessToken || undefined,
          clientId: account.clientId,
          clientSecret: account.clientSecret,
          email: account.email,
          refreshToken: account.refreshToken,
          region: account.region
        };
      }

      return {
        accessToken: account.accessToken || undefined,
        email: account.email,
        refreshToken: account.refreshToken,
        region: account.region
      };
    });
}

export function buildClaudeApiDirectImportPayload(
  accounts: StoredAccount[]
): ClaudeApiDirectImportItem[] {
  return accounts
    .filter(
      (account) => account.clientId.trim() !== '' && account.clientSecret.trim() !== ''
    )
    .map((account) => ({
      label: account.email || account.name || `kiro-${account.id}`,
      clientId: account.clientId,
      clientSecret: account.clientSecret,
      refreshToken: account.refreshToken || undefined,
      accessToken: account.accessToken || undefined,
      enabled: true,
      errorCount: 0,
      successCount: 0
    }));
}

export function generateCliproxyAuthFilename(account: StoredAccount): string {
  const authMethod = account.authMethod || 'builder-id';
  const identifier = sanitizeEmailForFilename(account.email);
  return `kiro-${authMethod}-${identifier}.json`;
}

export function buildCliproxyAuthRecord(
  account: StoredAccount,
  now: Date = new Date()
): CliproxyAuthFile {
  return {
    type: 'kiro',
    access_token: account.accessToken,
    refresh_token: account.refreshToken,
    profile_arn: account.profileArn,
    expires_at: new Date(account.accessTokenExpiresAt).toISOString(),
    auth_method: account.authMethod,
    provider: account.provider,
    last_refresh: now.toISOString(),
    client_id: account.clientId || undefined,
    client_secret: account.clientSecret || undefined,
    region: account.region || undefined,
    email: account.email || undefined
  };
}
