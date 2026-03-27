import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getRegistrationComparisonSummary,
  getRegistrationEvidenceSummary,
  getRegistrationProbeAvailabilityLabel,
  getRegistrationProbeMessage
} from './registerDiagnosticsUi.ts';

test('getRegistrationProbeAvailabilityLabel maps registration classifications to user-facing labels', () => {
  assert.equal(
    getRegistrationProbeAvailabilityLabel({
      executedAt: Date.now(),
      tempmail: {
        success: true,
        message: 'Tempmail 邮箱创建成功'
      },
      registrationProbe: {
        success: true,
        stage: 'send-otp',
        message: '已成功触发 OTP 发送',
        classification: 'reachable'
      }
    }),
    '可用'
  );

  assert.equal(
    getRegistrationProbeAvailabilityLabel({
      executedAt: Date.now(),
      tempmail: {
        success: true,
        message: 'Tempmail 邮箱创建成功'
      },
      registrationProbe: {
        success: false,
        stage: 'send-otp',
        message: 'Request was blocked by TES.',
        classification: 'tes-blocked'
      }
    }),
    'TES 拦截'
  );

  assert.equal(
    getRegistrationProbeAvailabilityLabel({
      executedAt: Date.now(),
      tempmail: {
        success: true,
        message: 'Tempmail 邮箱创建成功'
      },
      registrationProbe: {
        success: false,
        stage: 'prepare-profile-workflow',
        message: 'ECONNRESET',
        classification: 'network-error'
      }
    }),
    '网络失败'
  );
});

test('getRegistrationProbeMessage explains when registration probe was not executed', () => {
  assert.equal(
    getRegistrationProbeMessage(undefined),
    '点击“运行诊断”检查代理是否能真正推进到注册阶段'
  );

  assert.equal(
    getRegistrationProbeMessage({
      executedAt: Date.now(),
      tempmail: {
        success: false,
        message: 'Tempmail 邮箱创建失败'
      }
    }),
    '当前诊断未进入注册探测，通常是因为邮箱或前置链路尚未准备好'
  );
});

test('getRegistrationEvidenceSummary surfaces structured HTTP evidence for the latest probe', () => {
  assert.equal(
    getRegistrationEvidenceSummary({
      success: false,
      stage: 'send-otp',
      message: 'Request was blocked by TES.',
      classification: 'tes-blocked',
      evidence: {
        environmentSummary: 'USA / en-US / America/Los_Angeles (egress=US)',
        httpStatus: 400,
        requestUrl: 'https://profile.aws.amazon.com/api/send-otp',
        responseSnippet: '{"errorCode":"BLOCKED","message":"Request was blocked by TES."}',
        cookieNames: ['aws-user-profile-ubid'],
        stageTrace: []
      }
    }),
    'HTTP 400 · https://profile.aws.amazon.com/api/send-otp · cookies: aws-user-profile-ubid'
  );
});

test('getRegistrationComparisonSummary renders readable comparison lines', () => {
  assert.deepEqual(
    getRegistrationComparisonSummary({
      executedAt: Date.now(),
      tempmail: {
        success: true,
        message: 'Tempmail 邮箱创建成功'
      },
      registrationComparisons: [
        {
          label: 'Tempmail',
          email: 'diag@example.com',
          source: 'tempmail',
          result: {
            success: false,
            stage: 'send-otp',
            message: 'Request was blocked by TES.',
            email: 'diag@example.com',
            classification: 'tes-blocked'
          }
        },
        {
          label: '自定义邮箱',
          email: 'owner@example.com',
          source: 'custom',
          result: {
            success: true,
            stage: 'send-otp',
            message: '已成功触发 OTP 发送',
            email: 'owner@example.com',
            classification: 'reachable'
          }
        }
      ]
    }),
    [
      'Tempmail: TES 拦截 (send-otp)',
      '自定义邮箱: 可用 (send-otp)'
    ]
  );
});
