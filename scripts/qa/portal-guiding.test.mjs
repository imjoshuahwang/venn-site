import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateGuiding, mapGuidingError, GUIDING_ERRORS, GUIDING_QUESTIONS, GUIDING_MAX } from '../../src/data/guiding.ts';
import { saveGuidingAnswers, getMyGuidingAnswers } from '../../src/lib/portal/guiding.ts';
import { POST } from '../../src/pages/portal/guiding.ts';

test('validate: trims, whitelists ids, caps length, needs one answer', () => {
  assert.deepEqual(validateGuiding({ goal: '  hi ' }), { ok: true, answers: { goal: 'hi' } });
  assert.equal(validateGuiding({ bogus: 'x' }).code, 'invalid');
  assert.equal(validateGuiding({ goal: ' ' }).code, 'invalid');
  assert.equal(validateGuiding({ goal: 5 }).code, 'invalid');
  assert.equal(validateGuiding({}).code, 'invalid');
  assert.equal(validateGuiding(null).code, 'invalid');
  assert.equal(validateGuiding({ goal: 'x'.repeat(GUIDING_MAX + 1) }).code, 'too_long');
});

test('questions: three ids, no placeholders', () => {
  assert.deepEqual(GUIDING_QUESTIONS.map((q) => q.id), ['goal', 'skills', 'availability']);
  for (const q of GUIDING_QUESTIONS) assert.doesNotMatch(q.label, /lorem|\{|TODO|\[/i);
});

test('error map', () => {
  assert.equal(mapGuidingError({ code: '42501' }), 'forbidden');
  assert.equal(mapGuidingError({ code: '22023', message: 'guiding answers are closed' }), 'closed');
  assert.equal(mapGuidingError({ code: '22023', message: 'answer must be 1 to 1000 characters' }), 'too_long');
  assert.equal(mapGuidingError({ code: '22023', message: 'unknown question x' }), 'invalid');
  assert.equal(mapGuidingError({ code: '500' }), 'failed');
  for (const c of Object.keys(GUIDING_ERRORS)) assert.ok(GUIDING_ERRORS[c].length > 0);
});

test('wrappers: save maps rows, get filters unknown ids, errors throw', async () => {
  const sb = { rpc: async (n, a) => ({ data: [{ question: 'goal', answer: a.p_answers.goal }, { question: 'zzz', answer: 'no' }], error: null }) };
  assert.deepEqual(await saveGuidingAnswers(sb, 7, { goal: 'g' }), { goal: 'g' });
  const bad = { rpc: async () => ({ data: null, error: { code: '42501', message: 'nope' } }) };
  await assert.rejects(saveGuidingAnswers(bad, 7, { goal: 'g' }), (e) => e.code === '42501');
  const from = { from: () => ({ select: () => ({ eq: async () => ({ data: [{ question: 'skills', answer: 's' }], error: null }) }) }) };
  assert.deepEqual(await getMyGuidingAnswers(from, 7), { skills: 's' });
});

const req = (origin, body) => new Request('https://venn.test/portal/guiding', { method: 'POST', headers: { ...(origin ? { origin } : {}), 'content-type': 'application/json' }, body: JSON.stringify(body) });
const call = (r, locals) => POST({ request: r, locals });

test('endpoint: foreign or missing Origin is 403 before auth; no user is 401', async () => {
  assert.equal((await call(req('https://evil.test', {}), { user: { id: 'u' } })).status, 403);
  assert.equal((await call(req(null, {}), { user: { id: 'u' } })).status, 403);
  assert.equal((await call(req('https://venn.test', {}), {})).status, 401);
});

test('endpoint: validates, saves via the client, maps errors', async () => {
  const user = { id: 'u' };
  assert.equal((await call(req('https://venn.test', { resultId: 1, answers: { bogus: 'x' } }), { user, supabase: {} })).status, 400);
  assert.equal((await call(req('https://venn.test', { resultId: 'x', answers: { goal: 'g' } }), { user, supabase: {} })).status, 400);
  const ok = await call(req('https://venn.test', { resultId: 1, answers: { goal: ' g ' } }), { user, supabase: { rpc: async (n, a) => ({ data: [{ question: 'goal', answer: a.p_answers.goal }], error: null }) } });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { answers: { goal: 'g' } });
  const failWith = async (error) => call(req('https://venn.test', { resultId: 1, answers: { goal: 'g' } }), { user, supabase: { rpc: async () => ({ data: null, error }) } });
  assert.equal((await failWith({ code: '42501', message: 'x' })).status, 403);
  const closed = await failWith({ code: '22023', message: 'guiding answers are closed' });
  assert.equal(closed.status, 409);
  assert.equal((await closed.json()).error, 'closed');
  assert.equal((await failWith({ code: '500', message: 'x' })).status, 502);
});

import { guidingAccess } from '../../src/lib/portal/guiding.ts';
test('access: lead edits before cutoff, closed after, team read-only, null cutoff open', () => {
  const now = new Date('2026-11-20T00:00:00Z');
  assert.equal(guidingAccess({ isLead: true, cutoff: null, now }), 'edit');
  assert.equal(guidingAccess({ isLead: true, cutoff: '2026-12-01T00:00:00Z', now }), 'edit');
  assert.equal(guidingAccess({ isLead: true, cutoff: '2026-11-20T00:00:00Z', now }), 'closed');
  assert.equal(guidingAccess({ isLead: true, cutoff: '2026-11-01T00:00:00Z', now }), 'closed');
  assert.equal(guidingAccess({ isLead: false, cutoff: null, now }), 'readonly');
  assert.equal(guidingAccess({ isLead: false, cutoff: '2026-11-01T00:00:00Z', now }), 'readonly');
});
