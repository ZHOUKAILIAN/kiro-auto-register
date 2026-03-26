import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRegistrationRedeemRequest,
  extractWorkflowIdFromProfileRedirect,
  extractWorkflowStateHandleFromRedirect,
  resolveOtpAcquisitionMode
} from './kiroApiRegister.ts';

test('extractWorkflowIdFromProfileRedirect reads workflowID from hash-based profile redirects', () => {
  assert.equal(
    extractWorkflowIdFromProfileRedirect(
      'https://profile.aws.amazon.com/#/signup/start?workflowID=8320219c-de4f-426d-9e3f-e39d6151ff4f'
    ),
    '8320219c-de4f-426d-9e3f-e39d6151ff4f'
  );
});

test('extractWorkflowStateHandleFromRedirect reads workflowStateHandle from signin redirects', () => {
  assert.equal(
    extractWorkflowStateHandleFromRedirect(
      'https://us-east-1.signin.aws/platform/d-9067642ac7/signup?workflowStateHandle=23f6a074-9317-4d92-a25a-80001690448f'
    ),
    '23f6a074-9317-4d92-a25a-80001690448f'
  );
});

test('buildRegistrationRedeemRequest chooses method and field names based on redirect URL presence', () => {
  assert.deepEqual(
    buildRegistrationRedeemRequest({
      registrationCode: 'code-1',
      signInState: 'state-1',
      postCreateRedirectUrl: 'https://us-east-1.credentials.signin.aws/'
    }),
    {
      action: 'https://us-east-1.credentials.signin.aws/',
      method: 'GET',
      fields: {
        registrationCode: 'code-1',
        state: 'state-1'
      }
    }
  );

  assert.deepEqual(
    buildRegistrationRedeemRequest({
      registrationCode: 'code-2',
      signInState: 'state-2'
    }),
    {
      action: 'https://us-east-1.credentials.signin.aws/',
      method: 'POST',
      fields: {
        'registration-code': 'code-2',
        state: 'state-2'
      }
    }
  );
});

test('buildSessionHeaders applies region-aware user-agent and accept-language defaults', async () => {
  const profileModule = (await import('./environmentProfile.ts').catch(() => null)) as
    | {
        resolveEnvironmentProfile: (countryCode?: string) => {
          acceptLanguage: string;
          userAgent: string;
        };
      }
    | null;

  assert.ok(profileModule, 'environmentProfile.ts should exist for header shaping');
  if (!profileModule) {
    return;
  }

  const registerModule = (await import('./kiroApiRegister.ts')) as unknown as {
    buildSessionHeaders?: (options: {
      cookieHeader?: string;
      environmentProfile?: {
        acceptLanguage: string;
        userAgent: string;
      };
      initHeaders?: HeadersInit;
    }) => Headers;
  };

  assert.equal(
    typeof registerModule.buildSessionHeaders,
    'function',
    'kiroApiRegister.ts should export buildSessionHeaders'
  );
  if (typeof registerModule.buildSessionHeaders !== 'function') {
    return;
  }

  const profile = profileModule.resolveEnvironmentProfile('DE');
  const headers = registerModule.buildSessionHeaders({
    cookieHeader: 'session=value',
    environmentProfile: profile,
    initHeaders: {
      'x-trace-id': 'trace-1'
    }
  });

  assert.equal(headers.get('cookie'), 'session=value');
  assert.equal(headers.get('user-agent'), profile.userAgent);
  assert.equal(headers.get('accept-language'), profile.acceptLanguage);
  assert.equal(headers.get('x-trace-id'), 'trace-1');
});

test('resolveOtpAcquisitionMode prefers mailbox provider over manual fallback for custom mailboxes', () => {
  assert.equal(
    resolveOtpAcquisitionMode({
      inboxSource: 'custom',
      otpMode: 'mailbox'
    }),
    'mailbox'
  );

  assert.equal(
    resolveOtpAcquisitionMode({
      inboxSource: 'custom',
      otpMode: 'manual'
    }),
    'manual'
  );

  assert.equal(
    resolveOtpAcquisitionMode({
      inboxSource: 'tempmail',
      otpMode: 'tempmail'
    }),
    'tempmail'
  );
});
