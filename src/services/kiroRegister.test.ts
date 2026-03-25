import test from 'node:test';
import assert from 'node:assert/strict';

import * as kiroRegisterModule from './kiroRegister.ts';

test('kiroRegister only exposes the pure API registration entrypoint', () => {
  assert.equal(typeof kiroRegisterModule.autoRegister, 'function');
  assert.equal('enterAwsControlledInput' in kiroRegisterModule, false);
  assert.equal('waitForAwsButtonEnabled' in kiroRegisterModule, false);
});
