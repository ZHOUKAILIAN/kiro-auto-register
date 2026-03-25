import test from 'node:test';
import assert from 'node:assert/strict';

import { createInbox, waitForVerificationCode } from './tempmail.ts';

test('createInbox retries on transient tempmail errors before succeeding', async () => {
  const originalFetch = globalThis.fetch;
  let attempt = 0;

  globalThis.fetch = async () => {
    attempt += 1;

    if (attempt === 1) {
      return new Response(JSON.stringify({ error: 'rate limited' }), { status: 429 });
    }

    return new Response(
      JSON.stringify({
        address: 'retry@example.tempmail.lol',
        token: 'retry-token'
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  };

  try {
    const inbox = await createInbox({ maxRetries: 1, retryDelayMs: 0 });

    assert.equal(attempt, 2);
    assert.equal(inbox.email, 'retry@example.tempmail.lol');
    assert.equal(inbox.token, 'retry-token');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('createInbox accepts a custom fetch implementation for proxy-aware callers', async () => {
  let called = 0;

  const inbox = await createInbox({
    maxRetries: 0,
    fetchImpl: async (input, init) => {
      called += 1;
      assert.equal(String(input), 'https://api.tempmail.lol/v2/inbox/create');
      assert.equal(init?.method, 'POST');

      return new Response(
        JSON.stringify({
          address: 'custom-fetch@example.tempmail.lol',
          token: 'custom-fetch-token'
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  });

  assert.equal(called, 1);
  assert.equal(inbox.email, 'custom-fetch@example.tempmail.lol');
  assert.equal(inbox.token, 'custom-fetch-token');
});

test('waitForVerificationCode ignores stale emails older than the otpSentAt anchor', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        emails: [
          {
            id: 'old-mail',
            from: 'no-reply@signin.aws',
            subject: 'Old code',
            body: '111111',
            received_at: '2026-03-25T10:00:00Z'
          },
          {
            id: 'new-mail',
            from: 'no-reply@signin.aws',
            subject: 'New code',
            body: '222222',
            received_at: '2026-03-25T10:00:05Z'
          }
        ]
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  try {
    const code = await waitForVerificationCode('token-1', 50, undefined, {
      otpSentAt: Date.parse('2026-03-25T10:00:02Z'),
      pollIntervalMs: 0
    });

    assert.equal(code, '222222');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('waitForVerificationCode accepts legacy date field and timezone-normalized timestamps', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        emails: [
          {
            id: 'legacy-mail',
            from: 'no-reply@signin.aws',
            subject: 'Legacy code',
            body: '333333',
            date: '2026-03-25T18:00:07+08:00'
          }
        ]
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  try {
    const code = await waitForVerificationCode('token-2', 50, undefined, {
      otpSentAt: Date.parse('2026-03-25T10:00:05Z'),
      pollIntervalMs: 0
    });

    assert.equal(code, '333333');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
