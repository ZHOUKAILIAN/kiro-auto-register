import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SETTINGS,
  normalizeAccountRecord,
  normalizeSettings
} from './storeSchemas.ts';

test('normalizeSettings backfills defaults and preserves known values', () => {
  const normalized = normalizeSettings({
    proxyUrl: 'http://127.0.0.1:7890',
    registerCount: 3,
    autoImportClaude: true
  });

  assert.deepEqual(normalized, {
    ...DEFAULT_SETTINGS,
    proxyUrl: 'http://127.0.0.1:7890',
    registerCount: 3,
    autoImportClaude: true
  });
});

test('normalizeAccountRecord upgrades legacy sso-only accounts into the new shape', () => {
  const normalized = normalizeAccountRecord({
    id: 1,
    email: 'legacy@example.com',
    ssoToken: 'legacy-sso',
    name: 'Legacy User',
    createdAt: 1767000000000
  });

  assert.deepEqual(normalized, {
    id: 1,
    email: 'legacy@example.com',
    name: 'Legacy User',
    region: 'us-east-1',
    authMethod: 'builder-id',
    provider: 'BuilderId',
    ssoToken: 'legacy-sso',
    accessToken: '',
    refreshToken: '',
    clientId: '',
    clientSecret: '',
    profileArn: '',
    subscriptionTitle: '',
    usageCurrent: 0,
    usageLimit: 0,
    accessTokenExpiresAt: 0,
    createdAt: 1767000000000,
    updatedAt: 1767000000000
  });
});
