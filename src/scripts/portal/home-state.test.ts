import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveNextStepInput, kickoffFromTimeline, type HomeRaw } from './home-state.ts';
import { pickNextStep } from './next-step.ts';

const NOW = Date.parse('2026-11-20T00:00:00Z');
const base: HomeRaw = {
  outcome: 'cohort', phone: '+14155550123', timeline: null, mouSigned: true,
  parent: null, consents: [{ accepted: true }], guidingCount: 3,
};
const kind = (over: Partial<HomeRaw>) => pickNextStep(deriveNextStepInput({ ...base, ...over }), NOW).kind;

test('each home state is reachable from raw rows', () => {
  assert.equal(kind({ parent: { signed_at: null } }), 'waiting-on-parent');
  assert.equal(kind({ consents: [] }), 'consent-missing');
  assert.equal(kind({ mouSigned: false }), 'sign-mou');
  assert.equal(kind({ guidingCount: 0 }), 'guiding-questions');
  assert.equal(kind({ phone: null }), 'text-josh');
  assert.equal(kind({ timeline: 'Kickoff 2026-11-27, then weekly' }), 'kickoff-countdown');
  assert.equal(kind({}), 'all-set');
});

test('a signed parent releases the minor; a past kickoff is all-set', () => {
  assert.equal(kind({ parent: { signed_at: '2026-11-10T00:00:00Z' } }), 'all-set');
  assert.equal(kind({ timeline: '2026-11-01' }), 'all-set');
});

test('non-cohort results skip MOU and guiding questions', () => {
  assert.equal(kind({ outcome: 'peer', mouSigned: null, guidingCount: 0 }), 'all-set');
});

test('kickoffFromTimeline reads the first ISO date', () => {
  assert.equal(kickoffFromTimeline('Starts 2026-12-01 and ends 2027-02-01'), '2026-12-01T00:00:00Z');
  assert.equal(kickoffFromTimeline('Eight weeks'), null);
  assert.equal(kickoffFromTimeline(null), null);
});
