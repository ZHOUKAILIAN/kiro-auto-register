import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createMoeMailInbox,
  probeMoeMailProvider,
  waitForMoeMailVerificationCode
} from './moemail.ts';

test('createMoeMailInbox reads config, chooses a domain, and creates an inbox with API key auth', async () => {
  const requests: Array<{ url: string; method: string; apiKey: string | null; body?: string }> = [];

  const inbox = await createMoeMailInbox({
    baseUrl: 'https://moemail.app/',
    apiKey: 'mk_test_123',
    preferredDomain: 'moemail.app',
    fetchImpl: async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const headers = new Headers(init?.headers);
      const body = typeof init?.body === 'string' ? init.body : undefined;
      requests.push({
        url,
        method,
        apiKey: headers.get('x-api-key'),
        body
      });

      if (url === 'https://moemail.app/api/config') {
        return Response.json({
          emailDomains: 'moemail.app,example.com'
        });
      }

      if (url === 'https://moemail.app/api/emails/generate') {
        assert.match(body ?? '', /"domain":"moemail\.app"/);
        return Response.json({
          id: 'mailbox-1',
          email: 'aws-bot@moemail.app'
        });
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    }
  });

  assert.deepEqual(inbox, {
    id: 'mailbox-1',
    email: 'aws-bot@moemail.app',
    createdAt: inbox.createdAt,
    provider: 'moemail-api'
  });
  assert.equal(requests.length, 2);
  assert.deepEqual(
    requests.map((request) => ({
      url: request.url,
      method: request.method,
      apiKey: request.apiKey
    })),
    [
      {
        url: 'https://moemail.app/api/config',
        method: 'GET',
        apiKey: 'mk_test_123'
      },
      {
        url: 'https://moemail.app/api/emails/generate',
        method: 'POST',
        apiKey: 'mk_test_123'
      }
    ]
  );
});

test('waitForMoeMailVerificationCode polls recent AWS mail and returns the first matching 6-digit code', async () => {
  const code = await waitForMoeMailVerificationCode(
    {
      id: 'mailbox-2',
      email: 'aws-bot@moemail.app',
      createdAt: Date.now(),
      provider: 'moemail-api'
    },
    50,
    {
      baseUrl: 'https://moemail.app',
      apiKey: 'mk_test_456',
      otpSentAt: Date.parse('2026-03-26T07:40:00Z'),
      pollIntervalMs: 0,
      fetchImpl: async (input) => {
        const url = String(input);
        assert.equal(url, 'https://moemail.app/api/emails/mailbox-2');

        return Response.json({
          messages: [
            {
              id: 'msg-old',
              from_address: 'no-reply@login.awsapps.com',
              subject: 'Old code',
              content: '111111',
              html: '<div>111111</div>',
              received_at: Date.parse('2026-03-26T07:39:30Z')
            },
            {
              id: 'msg-new',
              from_address: 'no-reply@login.awsapps.com',
              subject: 'Verify your email',
              content: 'Your verification code is 654321',
              html: '<div>Your verification code is <strong>654321</strong></div>',
              received_at: Date.parse('2026-03-26T07:40:05Z')
            }
          ]
        });
      }
    }
  );

  assert.equal(code, '654321');
});

test('probeMoeMailProvider returns a clear failure when API key is missing', async () => {
  const result = await probeMoeMailProvider({
    baseUrl: 'https://moemail.app',
    apiKey: ''
  });

  assert.equal(result.success, false);
  assert.match(result.message, /API Key/i);
});
