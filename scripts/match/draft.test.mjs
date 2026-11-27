import test from 'node:test';
import assert from 'node:assert/strict';
import { draftAll, eligiblePeers, SLOT } from './draft-lib.mjs';

const mk = (id, o = {}) => ({ result_id: id, application_id: id * 10, season: 'fall-2026', outcome: 'peer', cohort_id: null, name: `S${id}`, org: `Org${id}`,
  level: 'college', working_on: 'robotics drones', need: 'mentors', is_test: false, max_open: 3, ...o });
const good = { fit: { together: ['both build drones'], common: ['robotics'] }, draft_message: `Hey, I'm S1 from Org1, we're doing drones. I'd love to get to know you. ${SLOT}` };
const gen = async () => good;
const pass = async () => ({ fit: 5, specificity: 4 });

test('minors pair only with minors, adults with adults', () => {
  const s = mk(1, { level: 'high_school' });
  const peers = [mk(2), mk(3, { level: 'high_school' })];
  assert.deepEqual(eligiblePeers(s, peers).map((p) => p.result_id), [3]);
  assert.deepEqual(eligiblePeers(mk(4), peers).map((p) => p.result_id), [2]);
});

test('opt-outs, pauses, test mix, other season and blocks are excluded', () => {
  const s = mk(1);
  const peers = [mk(2, { opted_out_at: 'x' }), mk(3, { paused_at: 'x' }), mk(4, { is_test: true }), mk(5, { season: 'spring-2027' }), mk(6), mk(7)];
  const r = eligiblePeers(s, peers, { blocks: [{ peer_result_id: 6, application_id: 10 }] });
  assert.deepEqual(r.map((p) => p.result_id), [7]);
});

test('capacity counts open matches and drafts made in this run', async () => {
  const peers = [mk(9, { max_open: 1 })];
  const matches = [];
  const r = await draftAll({ requesters: [mk(1), mk(2)], peers, matches, generate: gen, judge: pass });
  assert.deepEqual(r.matches.map((m) => m.status), ['draft', 'unmatched']);
  const full = await draftAll({ requesters: [mk(1)], peers: [mk(9, { max_open: 1 })], matches: [{ requester_result_id: 5, peer_result_id: 9, status: 'requested' }], generate: gen, judge: pass });
  assert.equal(full.matches[0].status, 'unmatched');
});

test('no fit writes unmatched with no peer', async () => {
  const r = await draftAll({ requesters: [mk(1)], peers: [], generate: gen, judge: pass });
  assert.deepEqual(r.matches, [{ requester_result_id: 1, peer_result_id: null, status: 'unmatched', fit: {}, draft_message: null, judge_score: null }]);
});

test('judge below 4 drops the draft and tries the next peer', async () => {
  const seen = [];
  const judge = async (me, peer) => { seen.push(peer.name); return peer.name === 'S2' ? { fit: 3, specificity: 5 } : { fit: 4, specificity: 5 }; };
  const r = await draftAll({ requesters: [mk(1)], peers: [mk(2), mk(3)], generate: gen, judge });
  assert.equal(seen.length, 2);
  assert.equal(r.matches[0].peer_result_id, 3);
  assert.equal(r.matches[0].judge_score, 4.5);
});

test('all judged low gives unmatched; invalid drafts are dropped', async () => {
  const low = await draftAll({ requesters: [mk(1)], peers: [mk(2)], generate: gen, judge: async () => ({ fit: 3, specificity: 3 }) });
  assert.equal(low.matches[0].status, 'unmatched');
  const bad = await draftAll({ requesters: [mk(1)], peers: [mk(2)], generate: async () => ({ ...good, draft_message: 'x'.repeat(601) + SLOT }), judge: pass });
  assert.equal(bad.matches[0].status, 'unmatched');
});

test('JSON shape, only draft or unmatched, existing open matches and cohort members skipped', async () => {
  const r = await draftAll({ requesters: [mk(1), mk(2), mk(3, { cohort_id: 5 })], peers: [mk(9)], matches: [{ requester_result_id: 2, peer_result_id: 8, status: 'approved' }], generate: gen, judge: pass });
  assert.equal(r.skipped, 2);
  assert.deepEqual(Object.keys(r), ['drafts', 'unmatched', 'skipped', 'matches']);
  assert.deepEqual(Object.keys(r.matches[0]).sort(), ['draft_message', 'fit', 'judge_score', 'peer_result_id', 'requester_result_id', 'status']);
  assert.equal(r.matches[0].status, 'draft');
  assert.ok(r.matches.every((m) => ['draft', 'unmatched'].includes(m.status)));
});

test('the model sees no email', async () => {
  let seen;
  await draftAll({ requesters: [mk(1, { email: 'a@b.co' })], peers: [mk(2, { email: 'c@d.co' })], generate: async (a, b) => { seen = JSON.stringify([a, b]); return good; }, judge: pass });
  assert.ok(!seen.includes('@'));
});
