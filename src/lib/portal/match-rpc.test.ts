import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, getMyMatch, matchRequest, introRespond } from './match-rpc.ts';

const fake = (data: unknown, error: { message: string } | null = null) => {
  const calls: Array<[string, unknown]> = [];
  return { calls, rpc: async (fn: string, args: unknown) => { calls.push([fn, args]); return { data, error }; } } as never as { calls: typeof calls } & import('@supabase/supabase-js').SupabaseClient;
};

test('escapeHtml neutralises markup and quotes', () => {
  assert.equal(escapeHtml(`<img src=x onerror="a('b')">&`), '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
  assert.equal(escapeHtml('plain'), 'plain');
});

test('wrappers pass named params and unwrap rows', async () => {
  const c = fake([{ match_id: 3, status: 'approved' }]);
  assert.equal((await getMyMatch(c))?.match_id, 3);
  assert.deepEqual(c.calls[0], ['get_my_match', { p_season: 'fall-2026' }]);
  await matchRequest(c, 3, 'hi');
  assert.deepEqual(c.calls[1], ['match_request', { p_match_id: 3, p_message: 'hi', p_learn: null }]);
  await introRespond(c, 'a'.repeat(64), 'accept');
  assert.deepEqual(c.calls[2], ['intro_respond', { p_token_hash: 'a'.repeat(64), p_action: 'accept' }]);
});

test('errors throw and empty results are null', async () => {
  await assert.rejects(() => getMyMatch(fake(null, { message: 'boom' })), /boom/);
  assert.equal(await getMyMatch(fake([])), null);
});
