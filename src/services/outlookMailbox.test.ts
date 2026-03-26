import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractVerificationCode,
  htmlToText,
  probeOutlookMailbox,
  waitForOutlookVerificationCode
} from './outlookMailbox.ts';

test('htmlToText strips markup and extractVerificationCode finds a 6-digit AWS style code', () => {
  const text = htmlToText(`
    <html>
      <body>
        <div>Your verification code is <strong>123456</strong></div>
      </body>
    </html>
  `);

  assert.match(text, /123456/);
  assert.equal(extractVerificationCode(text), '123456');
});

test('waitForOutlookVerificationCode refreshes token, scans recent AWS mail, and returns rotated refresh token', async () => {
  const otpSentAt = Date.now() - 10_000;
  const requests: string[] = [];

  const result = await waitForOutlookVerificationCode({
    email: 'owner@outlook.com',
    clientId: 'graph-client-id',
    refreshToken: 'refresh-token-1',
    otpSentAt,
    timeoutMs: 100,
    pollIntervalMs: 1,
    fetchImpl: async (input, init) => {
      const url = String(input);
      requests.push(url);

      if (url.includes('/oauth2/v2.0/token')) {
        assert.match(String(init?.body), /client_id=graph-client-id/);
        assert.match(String(init?.body), /grant_type=refresh_token/);
        return Response.json({
          access_token: 'access-token-1',
          refresh_token: 'refresh-token-2'
        });
      }

      if (url.startsWith('https://graph.microsoft.com/v1.0/me/messages?')) {
        return Response.json({
          value: [
            {
              id: 'msg-1',
              subject: 'Your AWS verification code',
              from: {
                emailAddress: {
                  address: 'no-reply@login.awsapps.com'
                }
              },
              receivedDateTime: new Date().toISOString(),
              bodyPreview: 'Your verification code is 123456',
              body: {
                content: '<div>Your verification code is <strong>123456</strong></div>',
                contentType: 'html'
              }
            }
          ]
        });
      }

      throw new Error(`Unexpected fetch url: ${url}`);
    }
  });

  assert.equal(result.code, '123456');
  assert.equal(result.nextRefreshToken, 'refresh-token-2');
  assert.ok(requests.some((url) => url.includes('/consumers/oauth2/v2.0/token')));
  assert.ok(requests.some((url) => url.startsWith('https://graph.microsoft.com/v1.0/me/messages?')));
});

test('probeOutlookMailbox returns a structured failure when required credentials are missing', async () => {
  const result = await probeOutlookMailbox({
    email: 'owner@outlook.com',
    clientId: '',
    refreshToken: ''
  });

  assert.equal(result.success, false);
  assert.match(result.message, /Outlook Graph client id/i);
});
