import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { peerView, stateOf, PEER_COPY } from '../../src/data/portal-peer.ts';
import { peerDown, getMyPeer, createPeerDownOnce } from '../../src/lib/portal/rpc-adapter.ts';

const read = (p) => fs.readFileSync(p, 'utf8');
// A hostile row: extra identifying fields and contact that must never reach the pre-mutual view.
const row = {
  match_id: 7, first_name: 'Maya', last_name: 'Okafor', school: 'Lincoln High', project: 'A tutoring app for refugees', place: 'Ohio, US',
  why_matched: 'You both build for teachers.', photo: 'x.jpg', linkedin: 'in/maya', email: 'maya@example.com', phone: '+15551234567',
  mine_down: false, theirs_down: false,
};
const FORBIDDEN = /maya@example|5551234567|Okafor|Lincoln|x\.jpg|linkedin|email|phone/i;

test('stateOf maps down flags: none, mine, theirs, both', () => {
  assert.equal(stateOf({ mine_down: false, theirs_down: false }), 'none');
  assert.equal(stateOf({ mine_down: true, theirs_down: false }), 'mine');
  assert.equal(stateOf({ mine_down: false, theirs_down: true }), 'theirs');
  assert.equal(stateOf({ mine_down: true, theirs_down: true }), 'both');
});

test('pre-mutual view models carry no contact, last name, school or photo', () => {
  for (const [mine, theirs, stage] of [[false, false, 'none'], [true, false, 'waiting'], [false, true, 'none']]) {
    const v = peerView({ ...row, mine_down: mine, theirs_down: theirs });
    assert.equal(v.stage, stage);
    assert.equal(v.contact, undefined);
    assert.deepEqual(Object.keys(v.card).sort(), ['firstName', 'place', 'project', 'why']);
    assert.doesNotMatch(JSON.stringify(v), FORBIDDEN);
  }
});

test('both-down shows contact from the peer_down return value only', () => {
  const v = peerView({ ...row, mine_down: true, theirs_down: true }, { name: 'Maya', email: 'maya@example.com', phone: '+15551234567' });
  assert.equal(v.stage, 'both');
  assert.equal(v.contact.email, 'maya@example.com');
  assert.doesNotMatch(JSON.stringify(v.card), FORBIDDEN);
  // row-borne contact is ignored: without the RPC return there is no contact
  assert.equal(peerView({ ...row, mine_down: true, theirs_down: true }).contact, undefined);
});

test("copy is short and the pill says I'd be down", () => {
  assert.equal(PEER_COPY.pill, "I'd be down");
  assert.match(PEER_COPY.waiting, /waiting on them/i);
  assert.match(PEER_COPY.both, /Josh will start your group/);
});

test('adapter: getMyPeer and peerDown call the #116 RPC names', async () => {
  const calls = [];
  const sb = { rpc: async (n, a) => { calls.push([n, a]); return { data: [{ match_id: 7, partner_name: 'Maya Okafor', partner_org: 'Ohio, US', partner_project: 'p', why_matched: 'w', i_am_down: true, they_are_down: true, partner_email: 'a@b.c' }], error: null }; } };
  assert.equal((await getMyPeer(sb)).match_id, 7);
  assert.equal((await peerDown(sb, 7)).email, 'a@b.c');
  assert.deepEqual(calls, [['get_my_peer', undefined], ['peer_down', { p_match_id: 7 }]]);
  const waiting = { rpc: async () => ({ data: [{ match_id: 7, partner_name: 'Maya', i_am_down: true, they_are_down: false, partner_email: null }], error: null }) };
  assert.equal(await peerDown(waiting, 7), null);
  await assert.rejects(peerDown({ rpc: async () => ({ data: null, error: new Error('boom') }) }, 7));
});

test('createPeerDownOnce: double tap sends one call; failure rolls back and allows retry', async () => {
  let n = 0; let fail = true;
  const send = async () => { n++; await new Promise((r) => setTimeout(r, 5)); if (fail) throw new Error('x'); return { email: 'a@b.c' }; };
  const tap = createPeerDownOnce(send);
  const [a, b] = await Promise.allSettled([tap(), tap()]);
  assert.equal(n, 1);
  assert.equal(a.status, 'rejected');
  assert.equal(b.status, 'rejected');
  fail = false;
  assert.equal((await tap()).email, 'a@b.c');
  assert.equal(n, 2);
});

test('peer page renders applicant text as text and keeps tokens', () => {
  const s = read('src/components/portal/results/Peer.astro');
  assert.doesNotMatch(s, /set:html|innerHTML/);
  assert.doesNotMatch(s, /confetti/i);
  assert.match(s, /min-height:\s*44px|class="pill/);
  assert.match(s, /prefers-reduced-motion/);
  assert.doesNotMatch(s, /#[0-9a-f]{3,6}\b/i);
});

test('peer wiring: real /portal uses adapter, fixture route DEV-guarded, endpoint calls adapter', () => {
  assert.match(read('src/pages/portal/index.astro'), /getMyPeer/);
  assert.match(read('src/pages/portal/dev/result.astro'), /import\.meta\.env\.DEV/);
  assert.match(read('src/pages/portal/peer-down.ts'), /peerDown/);
  assert.match(read('src/pages/portal/dev/peer-down.ts'), /import\.meta\.env\.DEV/);
});

test('pre-mutual HTML carries no JSON props or inline data blobs', () => {
  const s = read('src/components/portal/results/Peer.astro');
  assert.doesNotMatch(s, /define:vars|application\/json|JSON\.stringify/);
});
