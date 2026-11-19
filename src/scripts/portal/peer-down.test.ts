import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../../pages/portal/peer-down.ts';

const call = (locals: object, body = '{"matchId":1}') =>
  (POST as any)({ locals, request: new Request('http://x/portal/peer-down', { method: 'POST', body }) });

test('no session user is 401 with no body', async () => {
  const res = await call({ user: null });
  assert.equal(res.status, 401);
  assert.equal(await res.text(), '');
});
test('signed in with a bad matchId is 400', async () => {
  assert.equal((await call({ user: { id: 'u' } }, '{}')).status, 400);
});
