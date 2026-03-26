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

test('createInbox exposes detailed failure responses and retry logs', async () => {
  const logs: string[] = [];

  await assert.rejects(
    () =>
      createInbox({
        maxRetries: 0,
        retryDelayMs: 0,
        onProgress: (message) => logs.push(message),
        fetchImpl: async () =>
          new Response(
            JSON.stringify({
              error: 'The country you are requesting from (CN) is not allowed',
              captcha_required: true
            }),
            {
              status: 403,
              headers: { 'Content-Type': 'application/json' }
            }
          )
      }),
    /403.*captcha_required|403.*not allowed/i
  );

  assert.ok(logs.some((message) => message.includes('第 1/1 次尝试创建邮箱')));
  assert.ok(logs.some((message) => message.includes('创建邮箱响应 403')));
});

test('createInbox exposes nested proxy tunnel failures from fetch causes', async () => {
  const logs: string[] = [];

  await assert.rejects(
    () =>
      createInbox({
        maxRetries: 0,
        retryDelayMs: 0,
        onProgress: (message) => logs.push(message),
        fetchImpl: async () => {
          const tunnelError = Object.assign(
            new Error('Proxy response (502) !== 200 when HTTP Tunneling'),
            { code: 'UND_ERR_ABORTED' }
          );
          const requestCancelled = new Error('Request was cancelled.');
          Object.assign(requestCancelled, { cause: tunnelError });

          const fetchError = new TypeError('fetch failed');
          Object.assign(fetchError, { cause: requestCancelled });
          throw fetchError;
        }
      }),
    /Proxy response \(502\) !== 200 when HTTP Tunneling/
  );

  assert.ok(
    logs.some((message) => message.includes('Proxy response (502) !== 200 when HTTP Tunneling'))
  );
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

test('waitForVerificationCode logs matched mail context and extracted otp', async () => {
  const originalFetch = globalThis.fetch;
  const logs: string[] = [];

  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        emails: [
          {
            id: 'mail-1',
            from: 'no-reply@signin.aws',
            subject: 'Verify your email',
            body: 'Your code is 444444',
            received_at: '2026-03-25T10:00:07Z'
          }
        ]
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  try {
    const code = await waitForVerificationCode('token-3', 50, (message) => logs.push(message), {
      otpSentAt: Date.parse('2026-03-25T10:00:05Z'),
      pollIntervalMs: 0
    });

    assert.equal(code, '444444');
    assert.ok(logs.some((message) => message.includes('发件人') && message.includes('Verify your email')));
    assert.ok(logs.some((message) => message.includes('找到验证码: 444444')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
