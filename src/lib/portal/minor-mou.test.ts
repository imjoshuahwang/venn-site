import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parentEmailDiffers, parseSignBody } from './minor-mou.ts';

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]).toString('base64');

test('parent email must differ from the student, ignoring case and +tags', () => {
  assert.equal(parentEmailDiffers('kid@x.org', 'Kid@X.org'), false);
  assert.equal(parentEmailDiffers('kid@x.org', 'kid+mom@x.org'), false);
  assert.equal(parentEmailDiffers('kid@x.org', 'mom@x.org'), true);
  assert.equal(parentEmailDiffers('kid@x.org', 'nope'), false);
});

test('sign body: png magic, role, parent name', () => {
  assert.deepEqual(parseSignBody({ role: 'minor', png }), { role: 'minor', png, parentName: undefined });
  assert.equal(parseSignBody({ role: 'minor', png: 'AAAA' }), null);
  assert.equal(parseSignBody({ role: 'parent', png }), null);
  assert.equal(parseSignBody({ role: 'parent', png, parentName: ' Mom Lee ' })?.parentName, 'Mom Lee');
  assert.equal(parseSignBody({ role: 'boss', png }), null);
  assert.equal(parseSignBody(null), null);
});
