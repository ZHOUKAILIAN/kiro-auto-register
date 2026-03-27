import test from 'node:test';
import assert from 'node:assert/strict';

import {
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
