import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../../pages/portal/peer-down.ts';

const call = (locals: object, body = '{"matchId":1}') =>
  (POST as any)({ locals, request: new Request('http://x/portal/peer-down', { method: 'POST', body, headers: { origin: 'http://x' } }) });

test('no session user is 401 with no body', async () => {
  const res = await call({ user: null });
  assert.equal(res.status, 401);
  assert.equal(await res.text(), '');
});
test('signed in with a bad matchId is 400', async () => {
  assert.equal((await call({ user: { id: 'u' } }, '{}')).status, 400);
});

test('decline action calls peer_pass, never peer_down, and returns no contact', async () => {
  const calls: string[] = [];
  const supabase = { rpc: async (name: string) => { calls.push(name); return { data: null, error: null }; } };
  const res = await call({ user: { id: 'u' }, supabase }, '{"matchId":1,"action":"decline"}');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { contact: null });
  assert.deepEqual(calls, ['peer_pass']);
});
