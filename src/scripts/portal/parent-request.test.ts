import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../../pages/portal/parent-request.ts';

const call = (locals: object, email: string, origin = 'http://x') =>
  (POST as any)({
    locals,
    request: new Request('http://x/portal/parent-request', { method: 'POST', body: new URLSearchParams({ parent_email: email }), headers: { origin } }),
    redirect: (to: string, status: number) => new Response(null, { status, headers: { location: to } }),
  });
const asUser = (minor: boolean) => ({
  user: { id: 'u' },
  supabase: { rpc: async () => ({ data: { done: false, application: true, minor, answers: {} }, error: null }) },
});

test('cross-site origin is 403 and no session is 401', async () => {
  assert.equal((await call(asUser(true), 'p@x.org', 'http://evil')).status, 403);
  assert.equal((await call({ user: null }, 'p@x.org')).status, 401);
});
test('a malformed parent email redirects back with parent=invalid', async () => {
  const res = await call(asUser(true), 'nope');
  assert.equal(res.headers.get('location'), '/portal?parent=invalid');
});
test('a non-minor is rejected with 403 before any token or mail', async () => {
  assert.equal((await call(asUser(false), 'p@x.org')).status, 403);
});
