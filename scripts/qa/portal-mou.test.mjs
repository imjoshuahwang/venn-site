import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getMyMouSignature, isLead, cohortOrgCount } from '../../src/lib/portal/api.ts';
import { getCohortView } from '../../src/lib/portal/rpc-adapter.ts';
import { POST } from '../../src/pages/portal/mou.ts';

function fake({ rpc = {}, sig = null } = {}) {
  const calls = [];
  const chain = { select: () => chain, eq: () => chain, limit: () => chain, maybeSingle: async () => ({ data: sig, error: null }) };
  return {
    calls,
    rpc: async (fn, args) => (calls.push({ fn, args }), rpc[fn] ?? { data: null, error: null }),
    from: (t) => (calls.push({ fn: 'from:' + t }), chain),
  };
}

test('wrappers: signature via mou_signatures, isLead and cohortOrgCount via rpc', async () => {
  const sb = fake({ sig: { id: 1, typed_name: 'Maya Lee', signed_at: 't' }, rpc: { portal_is_lead: { data: true, error: null }, cohort_org_count: { data: 4, error: null } } });
  assert.equal((await getMyMouSignature(sb, 9)).data.typed_name, 'Maya Lee');
  assert.equal((await isLead(sb, 9)).data, true);
  assert.equal((await cohortOrgCount(sb, 9)).data, 4);
  assert.deepEqual(sb.calls, [{ fn: 'from:mou_signatures' }, { fn: 'portal_is_lead', args: { p_result_id: 9 } }, { fn: 'cohort_org_count', args: { p_result_id: 9 } }]);
  const bad = fake({ rpc: { portal_is_lead: { data: null, error: { message: 'x', code: '42501' } } } });
  assert.equal((await isLead(bad, 9)).error.code, '42501');
});

test('getCohortView combines signature, lead and org count', async () => {
  const sb = fake({ sig: null, rpc: { portal_is_lead: { data: false, error: null }, cohort_org_count: { data: 3, error: null } } });
  assert.deepEqual(await getCohortView(sb, 9), { signature: null, isLead: false, orgCount: 3 });
  const down = fake({ rpc: { portal_is_lead: { data: null, error: { message: 'x' } }, cohort_org_count: { data: null, error: { message: 'x' } } } });
  await assert.rejects(getCohortView(down, 9));
});

const post = (body, { origin = 'https://joinvenn.org', user = { id: 'u' }, sb = fake() } = {}) =>
  POST({
    locals: { user, supabase: sb },
    request: new Request('https://joinvenn.org/portal/mou', { method: 'POST', headers: { ...(origin ? { origin } : {}), 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
const ok = { resultId: 9, name: ' Maya Lee ', agreed: true };

test('mou endpoint refuses cross-site or missing Origin with 403, anonymous with 401', async () => {
  const sb = fake();
  assert.equal((await post(ok, { origin: 'https://evil.example', sb })).status, 403);
  assert.equal((await post(ok, { origin: null, sb })).status, 403);
  assert.equal((await post(ok, { user: null, sb })).status, 401);
  assert.equal(sb.calls.length, 0);
});

test('mou endpoint rejects invalid bodies without calling the rpc', async () => {
  const sb = fake();
  for (const b of [{ resultId: 9, name: '  ', agreed: true }, { resultId: 9, name: 'A', agreed: false }, { name: 'A', agreed: true }, { resultId: 'x', name: 'A', agreed: true }, 'not json']) {
    assert.equal((await post(b, { sb })).status, 400);
  }
  assert.equal(sb.calls.length, 0);
});

test('mou endpoint maps rpc errors', async () => {
  for (const [code, kind, status] of [['53400', 'full', 409], ['23505', 'signed', 409], ['42501', 'not_owner', 403], ['22023', 'invalid', 400], ['XX', 'retry', 502]]) {
    const sb = fake({ rpc: { sign_mou: { data: null, error: { message: 'm', code } } } });
    const res = await post(ok, { sb });
    assert.equal(res.status, status, code);
    assert.deepEqual(await res.json(), { error: kind });
  }
});

test('mou endpoint happy path trims the name and returns the signature', async () => {
  const sig = { id: 1, result_id: 9, typed_name: 'Maya Lee', agreed: true, signed_at: '2026-11-18T00:00:00Z' };
  const sb = fake({ rpc: { sign_mou: { data: sig, error: null } } });
  const res = await post(ok, { sb });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { signature: { typed_name: 'Maya Lee', signed_at: '2026-11-18T00:00:00Z' } });
  assert.deepEqual(sb.calls, [{ fn: 'sign_mou', args: { p_result_id: 9, p_typed_name: 'Maya Lee', p_agreed: true } }]);
});

test('dev mou stub is DEV-gated and offers every error kind', () => {
  const src = fs.readFileSync('src/pages/portal/dev/mou.ts', 'utf8');
  assert.match(src, /import\.meta\.env\.DEV/);
  for (const k of ['full', 'signed', 'not_owner', 'invalid', 'retry']) assert.ok(src.includes(k));
});
