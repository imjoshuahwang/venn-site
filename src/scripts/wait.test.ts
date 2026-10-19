import test from 'node:test';
import assert from 'node:assert/strict';
import { minWait } from './wait.ts';

test('resolves with the value, no sooner than ms', async () => {
  const t = Date.now();
  assert.equal(await minWait(Promise.resolve('ok'), 120), 'ok');
  assert.ok(Date.now() - t >= 100);
});

test('rejects without waiting extra', async () => {
  const t = Date.now();
  await assert.rejects(minWait(Promise.reject(new Error('boom')), 500), /boom/);
  assert.ok(Date.now() - t < 450, 'did not wait the full 500ms');
});
