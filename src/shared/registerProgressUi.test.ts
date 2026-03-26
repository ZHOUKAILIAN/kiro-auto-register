import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRegisterOutcomeMessage,
  buildRegisterStartupMessages,
  maskProxyUrlForDisplay
} from './registerProgressUi.ts';

test('buildRegisterStartupMessages explains immediate registration context without waiting for IPC progress', () => {
  assert.deepEqual(
    buildRegisterStartupMessages({
      count: 1,
      proxyUrl: '',
      registrationEmailMode: 'tempmail',
      otpMode: 'tempmail'
    }),
    [
      '已提交注册任务，准备启动 1 个注册流程',
      '网络出口：未设置代理，将使用当前系统网络',
      '邮箱来源：Tempmail 自动创建',
      'OTP 获取：Tempmail 自动轮询'
    ]
  );
});

test('buildRegisterStartupMessages describes custom mailbox and manual otp modes', () => {
  assert.deepEqual(
    buildRegisterStartupMessages({
      count: 2,
      proxyUrl: 'http://127.0.0.1:7890',
      registrationEmailMode: 'custom',
      otpMode: 'manual'
    }),
    [
      '已提交注册任务，准备启动 2 个注册流程',
      '网络出口：代理 http://127.0.0.1:7890',
      '邮箱来源：我自己的邮箱',
      'OTP 获取：界面手动输入'
    ]
  );
});

test('buildRegisterStartupMessages describes Outlook mailbox auto otp mode', () => {
  assert.deepEqual(
    buildRegisterStartupMessages({
      count: 1,
      proxyUrl: '',
      registrationEmailMode: 'custom',
      otpMode: 'mailbox',
      mailboxProvider: 'outlook-graph'
    }),
    [
      '已提交注册任务，准备启动 1 个注册流程',
      '网络出口：未设置代理，将使用当前系统网络',
      '邮箱来源：我自己的邮箱',
      'OTP 获取：邮箱自动收码（Outlook Graph）'
    ]
  );
});

test('maskProxyUrlForDisplay redacts ipfoxy proxy keys in startup logs', () => {
  assert.equal(
    maskProxyUrlForDisplay('ipfoxy://i5v0e62:c6e82f0f680c38072ffd27b976c62144'),
    'ipfoxy://i5v0e62:****2144'
  );
});

test('maskProxyUrlForDisplay redacts passwords for standard proxy urls', () => {
  assert.equal(
    maskProxyUrlForDisplay('socks5://proxy-user:proxy-pass@152.70.135.144:45019'),
    'socks5://proxy-user:****@152.70.135.144:45019'
  );
});

test('buildRegisterOutcomeMessage keeps success summary concise when all tasks pass', () => {
  assert.equal(
    buildRegisterOutcomeMessage({
      total: 2,
      successCount: 2,
      failureCount: 0,
      results: [
        { index: 1, success: true, message: 'ok' },
        { index: 2, success: true, message: 'ok' }
      ]
    }),
    '注册任务完成：成功 2 / 2'
  );
});

test('buildRegisterOutcomeMessage surfaces the first failure reason when tasks fail', () => {
  assert.equal(
    buildRegisterOutcomeMessage({
      total: 1,
      successCount: 0,
      failureCount: 1,
      results: [
        { index: 1, success: false, message: '创建邮箱失败: 403' }
      ]
    }),
    '注册任务失败：成功 0 / 1；创建邮箱失败: 403'
  );
});
