import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getTempmailAvailabilityLabel,
  normalizeOptionalProxyUrl
} from './registerDiagnosticsUi.ts';

test('normalizeOptionalProxyUrl trims empty input into undefined', () => {
  assert.equal(normalizeOptionalProxyUrl(undefined), undefined);
  assert.equal(normalizeOptionalProxyUrl(''), undefined);
  assert.equal(normalizeOptionalProxyUrl('   '), undefined);
  assert.equal(normalizeOptionalProxyUrl(' http://127.0.0.1:7890 '), 'http://127.0.0.1:7890');
});

test('getTempmailAvailabilityLabel distinguishes idle, success, and failure states', () => {
  assert.equal(getTempmailAvailabilityLabel(undefined), '待检测');
  assert.equal(
    getTempmailAvailabilityLabel({
      executedAt: 1,
      tempmail: {
        success: true,
        message: 'Tempmail 邮箱创建成功'
      }
    }),
    '可用'
  );
  assert.equal(
    getTempmailAvailabilityLabel({
      executedAt: 1,
      tempmail: {
        success: false,
        message: 'Tempmail 邮箱创建失败'
      }
    }),
    '不可用'
  );
});
