import test from 'node:test';
import assert from 'node:assert/strict';
import { POST as add } from '../../pages/portal/team/add.ts';
import { POST as remove } from '../../pages/portal/team/remove.ts';

const call = (h: any, path: string, fields: Record<string, string>, o: { origin?: string | null; rpc?: any; user?: any } = {}) => {
  const origin = o.origin === undefined ? 'http://portal.test' : o.origin;
  return h({
    locals: { user: o.user === undefined ? { id: 'u' } : o.user, supabase: { rpc: o.rpc ?? (async () => ({ data: 1, error: null })) } },
    request: new Request(`http://portal.test${path}`, { method: 'POST', body: new URLSearchParams(fields), headers: origin === null ? {} : { origin } }),
  }) as Promise<Response>;
};

test('foreign or missing Origin is 403, anonymous is 401', async () => {
  for (const o of ['https://evil.example', null]) {
    assert.equal((await call(add, '/portal/team/add', { email: 'a@b.co' }, { origin: o })).status, 403);
    assert.equal((await call(remove, '/portal/team/remove', { member_id: '1' }, { origin: o })).status, 403);
  }
  assert.equal((await call(add, '/portal/team/add', { email: 'a@b.co' }, { user: null })).status, 401);
});

test('add redirects with added=1 and passes the lowercased email', async () => {
  let args: any;
  const r = await call(add, '/portal/team/add', { email: ' A@B.co ' }, { rpc: async (n: string, a: any) => ((args = [n, a]), { data: 1, error: null }) });
  assert.equal(r.status, 303);
  assert.equal(r.headers.get('location'), '/portal/team?added=1');
  assert.deepEqual(args, ['add_team_member', { p_email: 'a@b.co' }]);
});

test('an RPC error is surfaced in the redirect, never swallowed', async () => {
  const bad = async () => ({ data: null, error: { message: 'team is full' } });
  const a = await call(add, '/portal/team/add', { email: 'a@b.co' }, { rpc: bad });
  assert.equal(a.headers.get('location'), '/portal/team?error=team%20is%20full');
  const r = await call(remove, '/portal/team/remove', { member_id: '2' }, { rpc: bad });
  assert.equal(r.headers.get('location'), '/portal/team?error=team%20is%20full');
  const t = await call(add, '/portal/team/add', { email: 'a@b.co' }, { rpc: async () => { throw new Error('x'); } });
  assert.match(t.headers.get('location')!, /error=/);
});

test('remove validates the id and redirects removed=1', async () => {
  assert.match((await call(remove, '/portal/team/remove', { member_id: 'x' })).headers.get('location')!, /error=/);
  assert.equal((await call(remove, '/portal/team/remove', { member_id: '2' })).headers.get('location'), '/portal/team?removed=1');
});
