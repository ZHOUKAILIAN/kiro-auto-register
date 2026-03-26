import test from 'node:test';
import assert from 'node:assert/strict';

import { getAccountActionHint } from './accountActionUi.ts';

test('getAccountActionHint explains why account actions are unavailable before registration', () => {
  assert.equal(
    getAccountActionHint(0, 0),
    '当前还没有账号，导出和删除会在首次注册成功后开放。'
  );
});

test('getAccountActionHint explains bulk behavior when no rows are selected', () => {
  assert.equal(
    getAccountActionHint(3, 0),
    '当前会对全部账号执行导出；删除前请先勾选要移除的账号。'
  );
});

test('getAccountActionHint explains selected-row behavior when rows are checked', () => {
  assert.equal(
    getAccountActionHint(5, 2),
    '当前已选中 2 个账号，导出和删除将只作用于选中项。'
  );
});
