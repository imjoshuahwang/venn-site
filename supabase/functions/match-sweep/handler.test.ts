import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from './handler.ts';

const base: Record<string, string> = { SUPABASE_URL: 'https://s.example.com', SUPABASE_SERVICE_ROLE_KEY: 'svc', MATCH_SWEEP_SECRET: 'sec', MATCH_TOKEN_SECRET: 'tok', STUDENT_RESEND_API_KEY: 'k' };
const person = (name: string, email: string, is_test = false) => ({ applications: { name, email, org: 'Club', is_test } });
const row = { id: 5, message: 'hello', requester: person('Sam Lovelace', 'contact+portal-r@joinvenn.org'), peer: person('Riley', 'contact+portal-p@joinvenn.org') };

function stub(sweep: unknown[], r = row) {
  const urls: string[] = [];
  const bodies: Record<string, unknown>[] = [];
  const fetch = (async (u: string, init?: RequestInit) => {
    urls.push(u);
    if (u.includes('api.resend.com')) {
      bodies.push({ ...JSON.parse(init!.body as string), key: (init!.headers as Record<string, string>)['Idempotency-Key'] });
      return new Response(JSON.stringify({ id: 'em_9' }));
    }
    if (u.includes('token_hash=is.null')) return new Response('[]');
    if (u.includes('rpc/match_sweep')) return new Response(JSON.stringify(sweep));
    return new Response(JSON.stringify([r]));
  }) as unknown as typeof globalThis.fetch;
  return { fetch, urls, bodies };
}
const call = (env: Record<string, string>, s: ReturnType<typeof stub>, secret = 'sec') =>
  handle(new Request('https://f.example.com/', { method: 'POST', headers: { 'x-webhook-secret': secret } }), (k) => env[k], { fetch: s.fetch, log: () => {} });

test('wrong secret is 401', async () => assert.equal((await call(base, stub([]), 'nope')).status, 401));

test('kill switch unset: no database call at all, nothing sent', async () => {
  const s = stub([{ match_id: 5, action: 'expire' }]);
  assert.deepEqual(await (await call(base, s)).json(), { disabled: true });
  assert.equal(s.urls.length, 0);
});

test('enabled: a reminder goes to the peer and an expiry to the requester, once each by key', async () => {
  const s = stub([{ match_id: 5, action: 'remind' }, { match_id: 5, action: 'expire' }]);
  const out = await (await call({ ...base, MATCH_SENDS_ENABLED: '1' }, s)).json();
  assert.equal(out.remind, 1);
  assert.equal(out.expire, 1);
  assert.deepEqual(s.bodies.map((b) => [b.key, b.to]), [['match-reminder-5', ['contact+portal-p@joinvenn.org']], ['match-expired-5', ['contact+portal-r@joinvenn.org']]]);
});

test('is_test rows are skipped', async () => {
  const s = stub([{ match_id: 5, action: 'remind' }], { ...row, peer: person('R', 'contact+portal-p@joinvenn.org', true) });
  const out = await (await call({ ...base, MATCH_SENDS_ENABLED: '1' }, s)).json();
  assert.equal(out.skipped, 1);
  assert.equal(s.bodies.length, 0);
});
