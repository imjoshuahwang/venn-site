import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHome, deriveNextStepInput, kickoffFromTimeline, pickNextStep, type HomeRaw, type NextStepInput } from './home.ts';
import { existsSync } from 'node:fs';

// Fake client: from(table) returns a thenable query over canned rows; every filter is a no-op.
const rows: Record<string, unknown[]> = {
  results: [{ id: 7, outcome: 'cohort', phone: null, cohort: { name: 'Acme', timeline: 'Kickoff 2026-12-01' } }],
  parent_consents: [], consents: [{ accepted: true }], guiding_answers: [{ id: 1 }], mou_signatures: [{ id: 1 }],
  team_members: [{ email_key: 'a@b.c' }],
};
const fake = (over: Record<string, unknown[] | Error> = {}) => ({
  from: (t: string) => {
    const v = over[t] ?? rows[t] ?? [];
    const q: any = { select: () => q, eq: () => q, is: () => q, limit: () => q, order: () => q, maybeSingle: () => q,
      then: (ok: (r: unknown) => void) => ok(v instanceof Error ? { data: null, error: { message: v.message } } : { data: t === 'results' ? (v as unknown[])[0] ?? null : v, error: null }) };
    return q;
  },
}) as never;

test('loadHome derives input, team and cohort from readable rows', async () => {
  const h = await loadHome(fake());
  assert.equal(h.input.outcome, 'cohort');
  assert.equal(h.input.phoneSaved, false);
  assert.equal(h.input.guidingAnswered, true);
  assert.equal(h.input.mouSigned, true);
  assert.equal(h.team.length, 1);
  assert.equal(h.cohortName, 'Acme');
});

test('loadHome empty: no result, no team, no cohort', async () => {
  const h = await loadHome(fake({ results: [], team_members: [] }));
  assert.equal(h.result, null);
  assert.deepEqual(h.team, []);
  assert.equal(h.cohortName, null);
});

test('loadHome throws on a read error', async () => {
  await assert.rejects(loadHome(fake({ consents: new Error('boom') })));
});


test('every next-step href resolves to an existing page or in-page anchor', () => {
  const none = { under18: null, parentSigned: null, consentGiven: null, mouSigned: null, outcome: null, guidingAnswered: null, phoneSaved: null, kickoffAt: null };
  const states = [{ under18: true, parentSigned: false }, { consentGiven: false }, { outcome: 'cohort', mouSigned: false }, { guidingAnswered: false }, { phoneSaved: false }, {}];
  for (const s of states) {
    const href = pickNextStep({ ...none, ...s } as NextStepInput).href;
    if (!href || href.startsWith('#')) continue;
    const p = new URL(`../../pages${href}`, import.meta.url).pathname;
    assert.ok(existsSync(`${p}.astro`) || existsSync(`${p}.ts`) || existsSync(`${p}/index.astro`), href);
  }
});

const NOW = Date.parse('2026-09-01T00:00:00Z');
// A null field means "no data, skip that state"; this baseline skips everything and lands on all-set.
const base: NextStepInput = { under18: null, parentSigned: null, consentGiven: null, mouSigned: null, outcome: 'cohort', guidingAnswered: null, phoneSaved: null, kickoffAt: null };
const pick = (o: Partial<NextStepInput>) => pickNextStep({ ...base, ...o }, NOW);

test('waiting-on-parent: under 18 and parent not signed, no link', () => {
  const s = pick({ under18: true, parentSigned: false });
  assert.equal(s.kind, 'waiting-on-parent');
  assert.equal(s.href, null);
});
test('consent-missing links to /portal/result', () => {
  const s = pick({ consentGiven: false });
  assert.deepEqual([s.kind, s.href], ['consent-missing', '/portal/result']);
});
test('sign-mou: cohort outcome with unsigned MOU links to /portal/result', () => {
  const s = pick({ mouSigned: false });
  assert.deepEqual([s.kind, s.href], ['sign-mou', '/portal/result']);
});
test('sign-mou is never asked of non-cohort outcomes', () => {
  assert.equal(pick({ outcome: 'peer', mouSigned: false }).kind, 'all-set');
});
test('guiding-questions links to /portal/result', () => {
  const s = pick({ guidingAnswered: false });
  assert.deepEqual([s.kind, s.href], ['guiding-questions', '/portal/result']);
});
test('text-josh when phone not saved, no card link (the form sits below)', () => {
  const s = pick({ phoneSaved: false });
  assert.deepEqual([s.kind, s.href], ['text-josh', null]);
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


const HOME_NOW = Date.parse('2026-11-20T00:00:00Z');
const rawBase: HomeRaw = {
  outcome: 'cohort', phone: '+14155550123', timeline: null, mouSigned: true,
  parent: null, consents: [{ accepted: true }], guidingCount: 3,
};
const kind = (over: Partial<HomeRaw>) => pickNextStep(deriveNextStepInput({ ...rawBase, ...over }), HOME_NOW).kind;

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
