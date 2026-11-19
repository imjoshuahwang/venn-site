import test from 'node:test';
import assert from 'node:assert/strict';
import { giveConsent, getMyPeer, getMyResult, markViewed, peerDown, signMou, finishCeremony, savePhone } from './api.ts';

// Stub client: records rpc calls; no network.
function stub(rpcResult: { data: unknown; error: unknown }, row: unknown = null) {
  const calls: { fn: string; args: unknown }[] = [];
  const chain: any = { select: () => chain, eq: () => chain, limit: () => chain, maybeSingle: async () => ({ data: row, error: null }) };
  const sb: any = { rpc: async (fn: string, args: unknown) => (calls.push({ fn, args }), rpcResult), from: (t: string) => (calls.push({ fn: 'from:' + t, args: null }), chain) };
  return { sb, calls };
}

test('giveConsent maps args and errors', async () => {
  const a = stub({ data: 5, error: null });
  const clauses = { coordinator_groups: true, highlights: false };
  assert.deepEqual(await giveConsent(a.sb, clauses, 'v1'), { data: 5, error: null });
  assert.deepEqual(a.calls[0], { fn: 'give_consent', args: { clauses, version: 'v1' } });
  const b = stub({ data: null, error: { message: 'unknown clause x', code: '22023' } });
  assert.deepEqual(await giveConsent(b.sb, {}, 'v1'), { data: null, error: { message: 'unknown clause x', code: '22023' } });
});

test('markViewed and finishCeremony map args', async () => {
  const { sb, calls } = stub({ data: '2026-11-18T00:00:00Z', error: null });
  assert.equal((await markViewed(sb, 7)).data, '2026-11-18T00:00:00Z');
  await finishCeremony(sb, 7);
  assert.deepEqual(calls, [{ fn: 'mark_viewed', args: { p_result_id: 7 } }, { fn: 'finish_ceremony', args: { p_result_id: 7 } }]);
});

test('getMyPeer unwraps first row, null when empty, season default', async () => {
  const card = { match_id: 1, partner_name: 'Bo', partner_email: null };
  const a = stub({ data: [card], error: null });
  assert.deepEqual((await getMyPeer(a.sb)).data, card);
  assert.deepEqual(a.calls[0], { fn: 'get_my_peer', args: { p_season: 'fall-2026' } });
  const b = stub({ data: [], error: null });
  assert.deepEqual(await getMyPeer(b.sb, 'x'), { data: null, error: null });
});

test('peerDown and signMou map args and errors', async () => {
  const a = stub({ data: [{ match_id: 3 }], error: null });
  assert.equal((await peerDown(a.sb, 3)).data?.match_id, 3);
  assert.deepEqual(a.calls[0], { fn: 'peer_down', args: { p_match_id: 3 } });
  const b = stub({ data: null, error: { message: 'already signed', code: '23505' } });
  const r = await signMou(b.sb, 5, 'Maya Lee', true);
  assert.deepEqual(b.calls[0], { fn: 'sign_mou', args: { p_result_id: 5, p_typed_name: 'Maya Lee', p_agreed: true } });
  assert.deepEqual(r, { data: null, error: { message: 'already signed', code: '23505' } });
});

test('getMyResult reads results with the cohort joined', async () => {
  const { sb, calls } = stub({ data: null, error: null }, { id: 1, cohort: { id: 2 } });
  assert.equal((await getMyResult(sb)).data?.id, 1);
  assert.equal(calls[0].fn, 'from:results');
});

test("savePhone maps args and returns the code", async () => {
  const { sb, calls } = stub({ data: "VENN-4F2K", error: null });
  assert.equal((await savePhone(sb, "+14155550123", true)).data, "VENN-4F2K");
  assert.deepEqual(calls[0], { fn: "save_phone", args: { p_phone: "+14155550123", p_whatsapp: true } });
});
