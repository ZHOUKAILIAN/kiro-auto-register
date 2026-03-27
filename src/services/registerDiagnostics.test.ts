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

test('runRegisterDiagnostics includes Outlook mailbox probe summary when mailbox mode is configured', async () => {
  const diagnostics = await runRegisterDiagnostics({
    fetchImpl: async () =>
      Response.json({
        ip: '66.93.67.200',
        city: 'Seoul',
        region: 'Seoul',
        country: 'KR',
        org: 'Example Network'
      }),
    createInboxFn: async () => ({
      email: 'diag@example.com',
      token: 'diag-token',
      createdAt: 1_764_000_000_000
    }),
    mailboxConfig: {
      provider: 'outlook-graph',
      email: 'owner@outlook.com',
      clientId: 'graph-client-id',
      refreshToken: 'refresh-token'
    },
    probeOutlookMailboxFn: async () => ({
      provider: 'outlook-graph',
      success: true,
      message: 'Outlook 邮箱连接正常',
      nextRefreshToken: 'refresh-token-2'
    })
  });

  assert.deepEqual(diagnostics.mailbox, {
    provider: 'outlook-graph',
    success: true,
    message: 'Outlook 邮箱连接正常',
    email: 'owner@outlook.com'
  });
});

test('runRegisterDiagnostics includes managed provider summary when MoeMail is selected', async () => {
  const diagnostics = await runRegisterDiagnostics({
    fetchImpl: async () =>
      Response.json({
        ip: '152.70.135.144',
        city: 'Seoul',
        region: 'Seoul',
        country: 'KR',
        org: 'Example Network'
      }),
    createInboxFn: async () => ({
      email: 'diag@example.com',
      token: 'diag-token',
      createdAt: 1_764_000_000_000
    }),
    managedEmailConfig: {
      provider: 'moemail-api',
      baseUrl: 'https://moemail.app',
      apiKey: 'mk_test_123',
      preferredDomain: 'moemail.app'
    },
    probeManagedEmailFn: async () => ({
      provider: 'moemail-api',
      success: true,
      message: 'MoeMail provider 可用',
      email: 'aws-bot@moemail.app'
    })
  });

  assert.deepEqual(diagnostics.managedEmail, {
    provider: 'moemail-api',
    success: true,
    message: 'MoeMail provider 可用',
    email: 'aws-bot@moemail.app'
  });
});

test('runRegisterDiagnostics includes registration probe summary when proxy can reach send-otp', async () => {
  let probeCallCount = 0;

  const diagnostics = await runRegisterDiagnostics({
    proxyUrl: 'http://proxy.example:8080',
    fetchImpl: async () =>
      Response.json({
        ip: '165.171.157.206',
        city: 'Sierra Vista',
        region: 'Arizona',
        country: 'US',
        org: 'AS15108 Allo Communications LLC'
      }),
    createInboxFn: async () => ({
      email: 'diag@example.com',
      token: 'diag-token',
      createdAt: 1_764_000_000_000
    }),
    probeRegistrationFn: async ({ email, country }) => {
      probeCallCount += 1;
      assert.equal(email, 'diag@example.com');
      assert.equal(country, 'US');
      return {
        success: false,
        stage: 'send-otp',
        message: '调用 profile /send-otp 失败: HTTP 400 {"errorCode":"BLOCKED","message":"Request was blocked by TES."}',
        email,
        classification: 'tes-blocked'
      };
    }
  });

  assert.equal(probeCallCount, 1);
  assert.deepEqual(diagnostics.registrationProbe, {
    success: false,
    stage: 'send-otp',
    message:
      '调用 profile /send-otp 失败: HTTP 400 {"errorCode":"BLOCKED","message":"Request was blocked by TES."}',
    email: 'diag@example.com',
    classification: 'tes-blocked'
  });
});

test('runRegisterDiagnostics skips registration probe when tempmail creation fails', async () => {
  let probeCallCount = 0;

  const diagnostics = await runRegisterDiagnostics({
    proxyUrl: 'http://proxy.example:8080',
    fetchImpl: async () =>
      Response.json({
        ip: '165.171.157.206',
        city: 'Sierra Vista',
        region: 'Arizona',
        country: 'US',
        org: 'AS15108 Allo Communications LLC'
      }),
    createInboxFn: async () => {
      throw new Error('Tempmail upstream unavailable');
    },
    probeRegistrationFn: async () => {
      probeCallCount += 1;
      return {
        success: true,
        stage: 'send-otp',
        message: 'ok',
        classification: 'reachable'
      };
    }
  });

  assert.equal(probeCallCount, 0);
  assert.equal(diagnostics.registrationProbe, undefined);
});

test('runRegisterDiagnostics compares tempmail and custom email probes and prefers the active email mode', async () => {
  const probeEmails: string[] = [];

  const diagnostics = await runRegisterDiagnostics({
    proxyUrl: 'http://proxy.example:8080',
    registrationEmailMode: 'custom',
    customEmailAddress: 'owner@example.com',
    fetchImpl: async () =>
      Response.json({
        ip: '66.93.67.200',
        city: 'Los Angeles',
        region: 'California',
        country: 'US',
        org: 'AS3257 GTT Communications Inc.'
      }),
    createInboxFn: async () => ({
      email: 'diag@example.com',
      token: 'diag-token',
      createdAt: 1_764_000_000_000
    }),
    probeRegistrationFn: async ({ email }) => {
      probeEmails.push(email);

      return {
        success: email === 'owner@example.com',
        stage: 'send-otp',
        message:
          email === 'owner@example.com'
            ? '已成功触发 OTP 发送，可继续等待邮箱验证码'
            : '调用 profile /send-otp 失败: HTTP 400 {"errorCode":"BLOCKED","message":"Request was blocked by TES."}',
        email,
        classification: email === 'owner@example.com' ? 'reachable' : 'tes-blocked',
        evidence: {
          environmentSummary: 'USA / en-US / America/Los_Angeles (egress=US)',
          httpStatus: email === 'owner@example.com' ? 200 : 400,
          requestUrl: 'https://profile.aws.amazon.com/api/send-otp',
          responseSnippet:
            email === 'owner@example.com'
              ? 'otp accepted'
              : '{"errorCode":"BLOCKED","message":"Request was blocked by TES."}',
          cookieNames: ['aws-user-profile-ubid'],
          stageTrace: [
            {
              stage: 'prepare-profile-workflow',
              ok: true,
              detail: 'ok',
              timestamp: 1_764_000_000_000
            },
            {
              stage: 'send-otp',
              ok: email === 'owner@example.com',
              detail: email === 'owner@example.com' ? 'ok' : 'blocked',
              timestamp: 1_764_000_000_500
            }
          ]
        }
      };
    }
  });

  assert.deepEqual(probeEmails, ['diag@example.com', 'owner@example.com']);
  assert.equal(diagnostics.registrationProbe?.email, 'owner@example.com');
  assert.equal(diagnostics.registrationProbe?.classification, 'reachable');
  assert.deepEqual(diagnostics.registrationComparisons, [
    {
      label: 'Tempmail',
      email: 'diag@example.com',
      source: 'tempmail',
      result: {
        success: false,
        stage: 'send-otp',
        message:
          '调用 profile /send-otp 失败: HTTP 400 {"errorCode":"BLOCKED","message":"Request was blocked by TES."}',
        email: 'diag@example.com',
        classification: 'tes-blocked',
        evidence: {
          environmentSummary: 'USA / en-US / America/Los_Angeles (egress=US)',
          httpStatus: 400,
          requestUrl: 'https://profile.aws.amazon.com/api/send-otp',
          responseSnippet: '{"errorCode":"BLOCKED","message":"Request was blocked by TES."}',
          cookieNames: ['aws-user-profile-ubid'],
          stageTrace: [
            {
              stage: 'prepare-profile-workflow',
              ok: true,
              detail: 'ok',
              timestamp: 1_764_000_000_000
            },
            {
              stage: 'send-otp',
              ok: false,
              detail: 'blocked',
              timestamp: 1_764_000_000_500
            }
          ]
        }
      }
    },
    {
      label: '自定义邮箱',
      email: 'owner@example.com',
      source: 'custom',
      result: {
        success: true,
        stage: 'send-otp',
        message: '已成功触发 OTP 发送，可继续等待邮箱验证码',
        email: 'owner@example.com',
        classification: 'reachable',
        evidence: {
          environmentSummary: 'USA / en-US / America/Los_Angeles (egress=US)',
          httpStatus: 200,
          requestUrl: 'https://profile.aws.amazon.com/api/send-otp',
          responseSnippet: 'otp accepted',
          cookieNames: ['aws-user-profile-ubid'],
          stageTrace: [
            {
              stage: 'prepare-profile-workflow',
              ok: true,
              detail: 'ok',
              timestamp: 1_764_000_000_000
            },
            {
              stage: 'send-otp',
              ok: true,
              detail: 'ok',
              timestamp: 1_764_000_000_500
            }
          ]
        }
      }
    }
  ]);
});
