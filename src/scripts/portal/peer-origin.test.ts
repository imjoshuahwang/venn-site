import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../../pages/portal/peer-down.ts';

const okLocals = { user: { id: 'u' }, supabase: { rpc: async () => ({ data: [], error: null }) } };
const callWith = (origin: string | null, locals: object = okLocals) =>
  (POST as any)({
    locals,
    request: new Request('http://portal.test/portal/peer-down', { method: 'POST', body: '{"matchId":1}', headers: origin === null ? {} : { origin } }),
  });

test('cross-site, malformed or missing Origin is 403 before anything else', async () => {
  for (const o of ['https://evil.example', 'http://portal.test.evil.example', 'null', 'not a url', null]) {
    assert.equal((await callWith(o)).status, 403, String(o));
  }
  assert.equal((await callWith('https://evil.example', { user: null })).status, 403);
});

test('same-site Origin passes the check', async () => {
  assert.notEqual((await callWith('http://portal.test')).status, 403);
});
