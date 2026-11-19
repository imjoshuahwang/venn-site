import test from 'node:test';
import assert from 'node:assert/strict';
import { isMinor } from './consent.ts';

test('isMinor is true only for high_school applicants', () => {
  assert.equal(isMinor({ level: 'high_school' }), true);
  assert.equal(isMinor({ level: 'college' }), false);
  assert.equal(isMinor({ level: 'other' }), false);
  assert.equal(isMinor({ level: null }), false);
  assert.equal(isMinor(null), false);
});
