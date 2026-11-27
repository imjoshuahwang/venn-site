import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from './handler.ts';

const base: Record<string, string> = { SUPABASE_URL: 'https://s.example.com', SUPABASE_SERVICE_ROLE_KEY: 'svc', MATCH_SWEEP_SECRET: 'sec', MATCH_TOKEN_SECRET: 'tok', STUDENT_RESEND_API_KEY: 'k' };
const person = (name: string, email: string, is_test = false) => ({ applications: { name, email, org: 'Club', is_test } });
const row = { id: 5, message: 'hello', requester: person('Sam Lovelace', 'contact+portal-r@joinvenn.org'), peer: person('Riley', 'contact+portal-p@joinvenn.org') };

function stub(sweep: unknown[], r = row, o: { pending?: unknown[]; resend?: number } = {}) {
  const urls: string[] = [];
  const marks: Record<string, unknown>[] = [];
  const bodies: Record<string, unknown>[] = [];
  const fetch = (async (u: string, init?: RequestInit) => {
    urls.push(u);
    if (u.includes('api.resend.com')) {
      bodies.push({ ...JSON.parse(init!.body as string), key: (init!.headers as Record<string, string>)['Idempotency-Key'] });
      return o.resend ? new Response('{}', { status: o.resend }) : new Response(JSON.stringify({ id: 'em_9' }));
    }
    if (u.includes('request_mailed_at=is.null')) return new Response(JSON.stringify(o.pending ?? []));
    if (u.includes('rpc/match_mail_done')) { marks.push(JSON.parse(init!.body as string)); return new Response('null'); }
    if (u.includes('rpc/match_sweep')) return new Response(JSON.stringify(sweep));
    return new Response(JSON.stringify([r]));
  }) as unknown as typeof globalThis.fetch;
  return { fetch, urls, bodies, marks };
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

const on = { ...base, MATCH_SENDS_ENABLED: '1' };

test('pending requests are chosen by no request mail sent, not by token_hash; success is marked', async () => {
  const s = stub([], row, { pending: [{ id: 5 }] });
  await call(on, s);
  assert.ok(s.urls.some((u) => u.includes('request_mailed_at=is.null')));
  assert.ok(!s.urls.some((u) => u.includes('token_hash=is.null')));
  assert.deepEqual(s.marks, [{ p_match_id: 5, p_kind: 'request' }]);
});

test('a failed request send is not marked, so the next sweep retries it', async () => {
  const s = stub([], row, { pending: [{ id: 5 }], resend: 500 });
  const out = await (await call(on, s)).json();
  assert.equal(out.failed, 1);
  assert.deepEqual(s.marks, []);
});

test('a failed reminder or expiry send is not marked and reuses the same idempotency keys', async () => {
  const s = stub([{ match_id: 5, action: 'remind' }, { match_id: 5, action: 'expire' }], row, { resend: 500 });
  await call(on, s);
  assert.deepEqual(s.marks, []);
  assert.deepEqual(s.bodies.map((b) => b.key), ['match-reminder-5', 'match-expired-5']);
});

test('a sent reminder and expiry are marked, including an expiry the webhook or a late click closed', async () => {
  const s = stub([{ match_id: 5, action: 'remind' }, { match_id: 5, action: 'expire' }]);
  await call(on, s);
  assert.deepEqual(s.marks, [{ p_match_id: 5, p_kind: 'reminder' }, { p_match_id: 5, p_kind: 'expiry' }]);
});

test('a missing service-role credential fails closed with 500 and no call', async () => {
  const s = stub([]);
  assert.equal((await call({ ...on, SUPABASE_SERVICE_ROLE_KEY: '' }, s)).status, 500);
  assert.equal(s.urls.length, 0);
});
