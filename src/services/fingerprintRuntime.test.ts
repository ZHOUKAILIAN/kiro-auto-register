import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBrowserData,
  generateFingerprint,
  resolveFingerprintReportResult
} from './fingerprintRuntime.ts';

test('resolveFingerprintReportResult supports legacy single-argument callbacks', () => {
  assert.equal(resolveFingerprintReportResult(['fingerprint-1']), 'fingerprint-1');
});

test('resolveFingerprintReportResult supports two-argument callbacks used by profile signup', () => {
  assert.equal(resolveFingerprintReportResult([null, 'fingerprint-2']), 'fingerprint-2');
  assert.throws(() => resolveFingerprintReportResult(['FWCIM failed', null]), /FWCIM failed/);
});

test('buildBrowserData serializes profile browserData in AWS expected shape', () => {
  const result = buildBrowserData({
    fingerprint: 'fingerprint-3',
    pageName: 'EMAIL_COLLECTION',
    eventType: 'PageLoad',
    ubid: '123-4567890-1234567',
    startedAt: 1_000,
    now: 2_234
  });

  assert.equal(result.elapsedTime, 1_234);
  assert.equal(result.browserData.attributes.fingerprint, 'fingerprint-3');
  assert.equal(result.browserData.attributes.pageName, 'EMAIL_COLLECTION');
  assert.equal(result.browserData.attributes.eventType, 'PageLoad');
  assert.equal(result.browserData.attributes.timeSpentOnPage, '1234');
  assert.equal(result.browserData.attributes.ubid, '123-4567890-1234567');
  assert.equal(typeof result.browserData.attributes.eventTimestamp, 'string');
  assert.deepEqual(result.browserData.cookies, {});
});

test('generateFingerprint provides browser-like canvas and navigator capabilities for FWCIM-style scripts', async () => {
  const fingerprint = await generateFingerprint({
    url: 'https://us-east-1.signin.aws/platform/d-9067642ac7/signup?workflowStateHandle=test',
    scriptContent: `
      window.fwcim = {
        profileForm() {},
        report(selector, callback) {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          ctx.fillRect(0, 0, 1, 1);

          callback(
            null,
            [
              navigator.userAgent.includes('Chrome'),
              navigator.platform,
              screen.width,
              typeof matchMedia('(prefers-color-scheme: dark)').matches,
              canvas.toDataURL().startsWith('data:image/png'),
              navigator.plugins.length
            ].join('|')
          );
        }
      };
    `
  });

  assert.equal(fingerprint, 'true|MacIntel|1440|boolean|true|3');
});
