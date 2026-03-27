import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createBrowserObservationSummary,
  isInterestingObservationUrl,
  pushBrowserObservationHit
} from './browserObservation.ts';

test('isInterestingObservationUrl matches AWS signup and profile API endpoints', () => {
  assert.equal(
    isInterestingObservationUrl('https://profile.aws.amazon.com/api/send-otp'),
    true
  );
  assert.equal(
    isInterestingObservationUrl(
      'https://us-east-1.signin.aws/platform/d-9067642ac7/signup?workflowStateHandle=test'
    ),
    true
  );
  assert.equal(
    isInterestingObservationUrl('https://d1osqh8czd52ng.cloudfront.net/fwcim_signin_us-east-1_prod.js'),
    false
  );
});

test('pushBrowserObservationHit keeps only the latest interesting hits and updates current url', () => {
  let summary = createBrowserObservationSummary(1_764_000_000_000);

  summary = pushBrowserObservationHit(summary, {
    type: 'navigation',
    url: 'https://profile.aws.amazon.com/',
    detail: 'did-navigate',
    timestamp: 1_764_000_000_100
  });

  for (let index = 0; index < 12; index += 1) {
    summary = pushBrowserObservationHit(summary, {
      type: 'response',
      url: `https://profile.aws.amazon.com/api/step-${index}`,
      status: 200,
      detail: `step-${index}`,
      timestamp: 1_764_000_000_200 + index
    });
  }

  assert.equal(summary.currentUrl, 'https://profile.aws.amazon.com/');
  assert.equal(summary.latestNetworkHits.length, 10);
  assert.equal(
    summary.latestNetworkHits[0]?.url,
    'https://profile.aws.amazon.com/api/step-2'
  );
  assert.equal(
    summary.latestNetworkHits[9]?.url,
    'https://profile.aws.amazon.com/api/step-11'
  );
});
