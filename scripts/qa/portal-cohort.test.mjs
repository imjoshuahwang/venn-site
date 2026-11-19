import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMou, mapMouError, safeHttps, MOU_COPY } from '../../src/data/mou.ts';

test('validation: empty, whitespace-only and unchecked are refused', () => {
  assert.equal(validateMou('', true).ok, false);
  assert.equal(validateMou('   ', true).ok, false);
  assert.equal(validateMou('Maya Lee', false).ok, false);
  assert.deepEqual(validateMou('  Maya Lee ', true), { ok: true, name: 'Maya Lee' });
});

test('RPC error mapping', () => {
  assert.equal(mapMouError('53400'), 'full');
  assert.equal(mapMouError('23505'), 'signed');
  assert.equal(mapMouError('42501'), 'not_owner');
  assert.equal(mapMouError('22023'), 'invalid');
  assert.equal(mapMouError('XX000'), 'retry');
  assert.equal(mapMouError(undefined), 'retry');
  for (const k of ['full', 'signed', 'not_owner', 'invalid', 'retry']) assert.ok(MOU_COPY.errors[k]);
});

test('only https urls render', () => {
  assert.equal(safeHttps('https://youtu.be/x'), 'https://youtu.be/x');
  for (const u of ['http://a.com', 'javascript:alert(1)', 'data:text/html,x', '', null, undefined, 'not a url']) assert.equal(safeHttps(u), null);
});
