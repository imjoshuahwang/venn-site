import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHome } from './home.ts';

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
