import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getMyPeer } from '../../src/lib/portal/rpc-adapter.ts';

const read = (p) => fs.readFileSync(p, 'utf8');
const base = { match_id: 1, partner_name: 'Maya', partner_org: 'Lincoln HS', partner_project: 'p', why_matched: 'w', i_am_down: false, they_are_down: false, partner_email: null };
const mk = (extra) => ({ rpc: async () => ({ data: [{ ...base, ...extra }], error: null }) });

test('adapter: place is "State, Country" and falls back to the partner org', async () => {
  assert.equal((await getMyPeer(mk({ partner_state: 'Ohio', partner_country: 'US' }))).place, 'Ohio, US');
  assert.equal((await getMyPeer(mk({ partner_state: null, partner_country: 'Kenya' }))).place, 'Kenya');
  assert.equal((await getMyPeer(mk({ partner_state: 'Ohio', partner_country: null }))).place, 'Ohio');
  assert.equal((await getMyPeer(mk({ partner_state: ' ', partner_country: null }))).place, 'Lincoln HS');
  assert.equal((await getMyPeer(mk({}))).place, 'Lincoln HS');
});

test('adapter: contact rides on getMyPeer only once both are down', async () => {
  assert.equal((await getMyPeer(mk({ i_am_down: true }))).contact, undefined);
  const both = { partner_name: 'Maya Lee', i_am_down: true, they_are_down: true, partner_email: 'maya@example.com' };
  assert.deepEqual((await getMyPeer(mk(both))).contact, { name: 'Maya Lee', email: 'maya@example.com' });
  assert.equal((await getMyPeer(mk({ ...both, i_am_down: false }))).contact, undefined);
});

test('real /portal load never taps: no peerDown call on GET, contact comes from the get_my_peer row', () => {
  const s = read('src/pages/portal/index.astro');
  assert.doesNotMatch(s, /peerDown/);
  assert.match(s, /row\.contact/);
});

test('migration: location columns are additive, grants stay authenticated-only', () => {
  const f = fs.readdirSync('supabase/migrations').find((n) => n.endsWith('get_my_peer_location.sql'));
  assert.ok(f);
  const m = read('supabase/migrations/' + f);
  assert.match(m, /add column if not exists state/i);
  assert.match(m, /partner_state/);
  assert.match(m, /to authenticated/);
  assert.doesNotMatch(m, /to anon|to public/i);
});
