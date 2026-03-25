import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRegistrationRedeemRequest,
  extractWorkflowIdFromProfileRedirect,
  extractWorkflowStateHandleFromRedirect
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
