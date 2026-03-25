import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildClaudeApiImportPayload,
  buildClaudeApiDirectImportPayload,
  buildCliproxyAuthRecord,
  generateCliproxyAuthFilename
} from './accountFormats.ts';
import type { StoredAccount } from '../shared/contracts.ts';

const sampleAccount: StoredAccount = {
  id: 101,
  email: 'builder@example.com',
  name: 'Builder User',
  region: 'us-east-1',
  authMethod: 'builder-id',
  provider: 'BuilderId',
  ssoToken: 'sso-token-value',
  accessToken: 'access-token-value',
  refreshToken: 'refresh-token-value',
  clientId: 'client-id-value',
  clientSecret: 'client-secret-value',
  profileArn: '',
  subscriptionTitle: 'KIRO FREE',
  usageCurrent: 10,
  usageLimit: 50,
  accessTokenExpiresAt: Date.parse('2026-12-31T16:00:00.000Z'),
  createdAt: 1767000000000,
  updatedAt: 1767000000000
};

test('buildClaudeApiImportPayload maps builder id credentials into import-by-token payload', () => {
  const payload = buildClaudeApiImportPayload([sampleAccount]);

  assert.deepEqual(payload, [
    {
      authMethod: 'IdC',
      accessToken: 'access-token-value',
      clientId: 'client-id-value',
      clientSecret: 'client-secret-value',
      email: 'builder@example.com',
      refreshToken: 'refresh-token-value',
      region: 'us-east-1'
    }
  ]);
});

test('buildClaudeApiDirectImportPayload maps stored accounts into /v2/accounts/import payload', () => {
  const payload = buildClaudeApiDirectImportPayload([sampleAccount]);

  assert.deepEqual(payload, [
    {
      label: 'builder@example.com',
      clientId: 'client-id-value',
      clientSecret: 'client-secret-value',
      refreshToken: 'refresh-token-value',
      accessToken: 'access-token-value',
      enabled: true,
      errorCount: 0,
      successCount: 0
    }
  ]);
});

test('generateCliproxyAuthFilename uses auth method and sanitized email', () => {
  assert.equal(
    generateCliproxyAuthFilename(sampleAccount),
    'kiro-builder-id-builder-example-com.json'
  );
});

test('buildCliproxyAuthRecord produces a cliproxy-compatible kiro auth file', () => {
  const record = buildCliproxyAuthRecord(sampleAccount, new Date('2026-03-25T12:00:00.000Z'));

  assert.deepEqual(record, {
    type: 'kiro',
    access_token: 'access-token-value',
    refresh_token: 'refresh-token-value',
    profile_arn: '',
    expires_at: '2026-12-31T16:00:00.000Z',
    auth_method: 'builder-id',
    provider: 'BuilderId',
    last_refresh: '2026-03-25T12:00:00.000Z',
    client_id: 'client-id-value',
    client_secret: 'client-secret-value',
    region: 'us-east-1',
    email: 'builder@example.com'
  });
});
