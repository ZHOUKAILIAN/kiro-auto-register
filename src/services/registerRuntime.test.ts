import test from 'node:test';
import assert from 'node:assert/strict';

import { RegisterRuntimeController } from './registerRuntime.ts';

test('RegisterRuntimeController keeps pending manual OTP state until the matching task is submitted', async () => {
  const runtime = new RegisterRuntimeController();

  runtime.setRegistering(true);
  const otpPromise = runtime.requestManualOtp({
    registerIndex: 1,
    email: 'owner@example.com'
  });

  const pendingOtp = runtime.getState().pendingOtp;
  assert.ok(pendingOtp);
  assert.equal(pendingOtp?.registerIndex, 1);
  assert.equal(pendingOtp?.email, 'owner@example.com');
  assert.equal(runtime.getState().isRegistering, true);

  const submitResult = runtime.submitManualOtp(pendingOtp?.taskId || '', '123456');
  assert.deepEqual(submitResult, {
    success: true,
    message: '验证码已提交: 123456'
  });
  assert.equal(await otpPromise, '123456');
  assert.equal(runtime.getState().pendingOtp, undefined);
});

test('RegisterRuntimeController rejects OTP submissions for unknown tasks', () => {
  const runtime = new RegisterRuntimeController();

  runtime.requestManualOtp({
    registerIndex: 2,
    email: 'owner@example.com'
  });

  const submitResult = runtime.submitManualOtp('missing-task', '123456');
  assert.deepEqual(submitResult, {
    success: false,
    message: '当前没有匹配的验证码任务'
  });
  assert.ok(runtime.getState().pendingOtp);
});
