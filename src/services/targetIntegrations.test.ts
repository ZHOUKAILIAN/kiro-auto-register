import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';

import {
  importAccountsToClaudeApi,
  probeClaudeApiChat,
  writeAccountsToCliproxy
} from './targetIntegrations.ts';
import type { StoredAccount, TargetIntegrationSettings } from '../shared/contracts.ts';

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

const sampleSettings: TargetIntegrationSettings = {
  claudeApiBaseUrl: 'http://127.0.0.1:62311',
  claudeApiAdminKey: 'admin',
  cliproxyAuthDir: ''
};

test('importAccountsToClaudeApi returns a failure result when claude-api is unreachable', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('network down');
  };

  try {
    const result = await importAccountsToClaudeApi([sampleAccount], sampleSettings);

    assert.equal(result.success, false);
    assert.equal(result.imported, 0);
    assert.equal(result.failed, 1);
    assert.match(result.message, /network down/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('writeAccountsToCliproxy returns a failure result when target path cannot be used as a directory', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'kiro-target-integrations-'));
  const filePath = path.join(tempDir, 'not-a-directory.json');
  await writeFile(filePath, '{}\n');

  try {
    const result = await writeAccountsToCliproxy([sampleAccount], filePath);

    assert.equal(result.success, false);
    assert.equal(result.written.length, 0);
    assert.equal(result.failed.length, 1);
    assert.equal(result.failed[0]?.accountId, sampleAccount.id);
    assert.match(result.failed[0]?.message || '', /EEXIST|not a directory/i);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('importAccountsToClaudeApi falls back to /v2/accounts/import when import-by-token is unavailable', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: string }> = [];

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({
      url,
      body: typeof init?.body === 'string' ? init.body : ''
    });

    if (url.endsWith('/v2/accounts/import-by-token')) {
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.endsWith('/v2/accounts/import')) {
      return new Response(
        JSON.stringify({
          success: true,
          imported: 1,
          failed: 0,
          duplicate: 0,
          message: '成功导入 1 个账号'
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    throw new Error(`unexpected url: ${url}`);
  };

  try {
    const result = await importAccountsToClaudeApi([sampleAccount], sampleSettings);

    assert.equal(result.success, true);
    assert.equal(result.imported, 1);
    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.url, 'http://127.0.0.1:62311/v2/accounts/import-by-token');
    assert.equal(calls[1]?.url, 'http://127.0.0.1:62311/v2/accounts/import');
    assert.deepEqual(JSON.parse(calls[1]?.body || '[]'), [
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
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('probeClaudeApiChat returns a structured failure result when claude-api has no usable account', async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = '';
  let capturedBody = '';

  globalThis.fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedBody = typeof init?.body === 'string' ? init.body : '';

    return new Response(JSON.stringify({ error: '无可用账号，请先添加并配置账号' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    const result = await probeClaudeApiChat(sampleSettings);

    assert.equal(capturedUrl, 'http://127.0.0.1:62311/v2/test/chat/completions');
    assert.equal(result.success, false);
    assert.equal(result.status, 503);
    assert.match(result.message, /无可用账号/);
    assert.deepEqual(JSON.parse(capturedBody), {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 32,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: 'Reply with OK.'
        }
      ]
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('probeClaudeApiChat returns success when claude-api responds with a completion payload', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        id: 'chatcmpl-1',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'OK'
            }
          }
        ]
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  try {
    const result = await probeClaudeApiChat(sampleSettings);

    assert.equal(result.success, true);
    assert.equal(result.status, 200);
    assert.equal(result.replyText, 'OK');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
