import test from 'node:test';
import assert from 'node:assert/strict';
import { sendAllowed } from './allowlist.ts';

test('unset or empty refuses everything', () => {
  assert.equal(sendAllowed('a@b.com', undefined), false);
  assert.equal(sendAllowed('a@b.com', ''), false);
  assert.equal(sendAllowed('a@b.com', ' , '), false);
});
test('star alone allows all', () => assert.equal(sendAllowed('kid@school.edu', '*'), true));
test('glob in the local part, case-insensitive', () => {
  const l = 'imjoshuahwang+*@gmail.com';
  assert.equal(sendAllowed('ImJoshuaHwang+c5check@gmail.com', l), true);
  assert.equal(sendAllowed('imjoshuahwang+@gmail.com', l), true);
  assert.equal(sendAllowed('imjoshuahwang@gmail.com', l), false);
  assert.equal(sendAllowed('refuse-check@example.com', l), false);
  assert.equal(sendAllowed('imjoshuahwang+x@gmail.com.evil.com', l), false);
  assert.equal(sendAllowed('imjoshuahwang+x@evil.com', l), false);
});
test('exact entries in a list', () => {
  assert.equal(sendAllowed('Josh@x.com', 'a@y.com, josh@x.com'), true);
  assert.equal(sendAllowed('b@y.com', 'a@y.com, josh@x.com'), false);
});
