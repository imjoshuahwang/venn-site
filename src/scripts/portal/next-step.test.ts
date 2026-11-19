import test from 'node:test';
import assert from 'node:assert/strict';
import { pickNextStep, type NextStepInput } from './next-step.ts';

const NOW = Date.parse('2026-09-01T00:00:00Z');
// A null field means "no data, skip that state"; this baseline skips everything and lands on all-set.
const base: NextStepInput = { under18: null, parentSigned: null, consentGiven: null, mouSigned: null, outcome: 'cohort', guidingAnswered: null, phoneSaved: null, kickoffAt: null };
const pick = (o: Partial<NextStepInput>) => pickNextStep({ ...base, ...o }, NOW);

test('waiting-on-parent: under 18 and parent not signed, no link', () => {
  const s = pick({ under18: true, parentSigned: false });
  assert.equal(s.kind, 'waiting-on-parent');
  assert.equal(s.href, null);
});
test('consent-missing links to /portal/consent', () => {
  const s = pick({ consentGiven: false });
  assert.deepEqual([s.kind, s.href], ['consent-missing', '/portal/consent']);
});
test('sign-mou: cohort outcome with unsigned MOU links to /portal/result', () => {
  const s = pick({ mouSigned: false });
  assert.deepEqual([s.kind, s.href], ['sign-mou', '/portal/result']);
});
test('sign-mou is never asked of non-cohort outcomes', () => {
  assert.equal(pick({ outcome: 'peer', mouSigned: false }).kind, 'all-set');
});
test('guiding-questions links to /portal/questions', () => {
  const s = pick({ guidingAnswered: false });
  assert.deepEqual([s.kind, s.href], ['guiding-questions', '/portal/questions']);
});
test('text-josh when phone not saved, anchored on the home page', () => {
  const s = pick({ phoneSaved: false });
  assert.deepEqual([s.kind, s.href], ['text-josh', '#text-josh']);
});
test('kickoff-countdown reports whole days left, rounded up', () => {
  const s = pick({ kickoffAt: '2026-09-08T00:00:00Z' });
  assert.equal(s.kind, 'kickoff-countdown');
  assert.equal(s.days, 7);
  assert.equal(pick({ kickoffAt: '2026-09-01T10:00:00Z' }).days, 1);
});
test('past kickoff falls through to all-set', () => {
  assert.equal(pick({ kickoffAt: '2026-08-01T00:00:00Z' }).kind, 'all-set');
});
test('all-set when everything is done', () => {
  const s = pick({ parentSigned: true, consentGiven: true, mouSigned: true, guidingAnswered: true, phoneSaved: true });
  assert.deepEqual([s.kind, s.href], ['all-set', null]);
});
test('priority: under 18 with unsigned MOU is waiting-on-parent, not sign-mou', () => {
  assert.equal(pick({ under18: true, parentSigned: false, mouSigned: false, consentGiven: false }).kind, 'waiting-on-parent');
});
test('priority: consent beats MOU beats questions beats text', () => {
  assert.equal(pick({ consentGiven: false, mouSigned: false }).kind, 'consent-missing');
  assert.equal(pick({ mouSigned: false, guidingAnswered: false }).kind, 'sign-mou');
  assert.equal(pick({ guidingAnswered: false, phoneSaved: false }).kind, 'guiding-questions');
});
test('under 18 with parent signed moves on to the next state', () => {
  assert.equal(pick({ under18: true, parentSigned: true, mouSigned: false }).kind, 'sign-mou');
});
test('null and unknown input degrade to all-set, never throw', () => {
  assert.equal(pickNextStep(null, NOW).kind, 'all-set');
  assert.equal(pickNextStep(undefined, NOW).kind, 'all-set');
  assert.equal(pickNextStep({} as never, NOW).kind, 'all-set');
  assert.equal(pick({ kickoffAt: 'garbage' }).kind, 'all-set');
});
