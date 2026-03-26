import test from 'node:test';
import assert from 'node:assert/strict';

import { runRegisterDiagnostics } from './registerDiagnostics.ts';

test('runRegisterDiagnostics returns structured egress, tempmail, and latest aws failure summary', async () => {
  const diagnostics = await runRegisterDiagnostics({
    proxyUrl: 'http://proxy.example:8080',
    lastFailure: {
      stage: 'send-otp',
      message: 'Request was blocked by TES.',
      timestamp: 1_764_000_000_000
    },
    fetchImpl: async (input) => {
      assert.equal(String(input), 'https://ipinfo.io/json');
      return Response.json({
        ip: '66.93.67.200',
        city: 'Los Angeles',
        region: 'California',
        country: 'US',
        org: 'AS3257 GTT Communications Inc.'
      });
    },
    createInboxFn: async () => ({
      email: 'diag@example.com',
      token: 'diag-token',
      createdAt: 1_764_000_000_000
    })
  });

  assert.equal(diagnostics.proxyUrl, 'http://proxy.example:8080');
  assert.deepEqual(diagnostics.egress, {
    ip: '66.93.67.200',
    city: 'Los Angeles',
    region: 'California',
    country: 'US',
    org: 'AS3257 GTT Communications Inc.'
  });
  assert.deepEqual(diagnostics.tempmail, {
    success: true,
    message: 'Tempmail 邮箱创建成功',
    email: 'diag@example.com'
  });
  assert.deepEqual(diagnostics.aws, {
    stage: 'send-otp',
    message: 'Request was blocked by TES.'
  });
});

test('runRegisterDiagnostics keeps nested proxy cause details in tempmail failure messages', async () => {
  const diagnostics = await runRegisterDiagnostics({
    proxyUrl: 'http://proxy.example:8080',
    fetchImpl: async () =>
      Response.json({
        ip: '66.93.67.200',
        city: 'Los Angeles',
        region: 'California',
        country: 'US',
        org: 'AS3257 GTT Communications Inc.'
      }),
    createInboxFn: async () => {
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
  });

  assert.equal(diagnostics.tempmail.success, false);
  assert.match(
    diagnostics.tempmail.message,
    /Proxy response \(502\) !== 200 when HTTP Tunneling/
  );
});
