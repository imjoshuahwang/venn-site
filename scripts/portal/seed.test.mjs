import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { SEEDED_USERS, buildPlan, resolveTarget, PARENT_TOKEN } from './users.mjs';

const EMAIL = /^contact\+portal-[a-z0-9-]+@joinvenn\.org$/;
const plan = buildPlan();

test('every email matches the test pattern and is unique', () => {
  const all = [...SEEDED_USERS.map((u) => u.email), plan.parent.parent_email];
  for (const e of all) assert.match(e, EMAIL);
  assert.equal(new Set(all).size, all.length);
});

test('plan covers every outcome and variant', () => {
  const by = (s) => plan.results.find((r) => r.slug === s);
  assert.equal(by('cohort').outcome, 'cohort');
  assert.equal(by('cohort').ceremony_done_at, null);
  assert.ok(by('cohort-done').ceremony_done_at);
  assert.equal(by('network').outcome, 'network_waitlist');
  assert.equal(by('track').outcome, 'track_waitlist');
  assert.equal(by('nts').outcome, 'not_this_season');
  assert.equal(by('draft').status, 'draft');
  assert.equal(by('lead').outcome, 'cohort');
  assert.equal(plan.cohorts.find((c) => c.slug === by('cohort-full').cohort).seat_cap, 1);
  for (const r of plan.results) {
    assert.ok(r.letter && r.letter.length > 0, r.slug);
    if (r.slug !== 'draft') assert.equal(r.status, 'approved');
  }
  const down = plan.pairs.map((p) => [p.a_down, p.b_down].filter(Boolean).length).sort();
  assert.deepEqual(down, [0, 1, 2]);
  assert.equal(plan.parent.signed_at, null);
  assert.equal(plan.teamMembers.length, 2);
  assert.ok(plan.teamMembers.every((m) => m.lead === 'lead'));
  for (const u of SEEDED_USERS) assert.ok(u.slug && u.outcome && u.landing, u.slug);
  assert.ok(PARENT_TOKEN);
});

test('target guard refuses before any write', () => {
  const key = 'k';
  assert.throws(() => resolveTarget({ target: 'local', env: { SUPABASE_URL: 'https://abc.supabase.co' } }));
  assert.throws(() => resolveTarget({ target: 'preview', env: {} }));
  assert.throws(() => resolveTarget({ target: 'preview', env: { PREVIEW_SUPABASE_URL: 'https://wirjadichvbmrqzamwtp.supabase.co', PREVIEW_SERVICE_ROLE_KEY: key } }));
  assert.throws(() => resolveTarget({ target: 'preview', env: { PREVIEW_SUPABASE_URL: 'http://127.0.0.1:54321', PREVIEW_SERVICE_ROLE_KEY: key } }));
  assert.equal(resolveTarget({ target: 'preview', env: { PREVIEW_SUPABASE_URL: 'https://prev.supabase.co', PREVIEW_SERVICE_ROLE_KEY: key } }).url, 'https://prev.supabase.co');
  assert.match(resolveTarget({ target: 'local', env: {} }).url, /127\.0\.0\.1/);
});

test('home-state seed users reach every next-step state (#131)', () => {
  const by = (s) => plan.results.find((r) => r.slug === s);
  const has = (list, s) => list.some((x) => (x.slug ?? x) === s);
  for (const s of ['home-consent', 'home-questions', 'home-phone', 'home-kickoff', 'home-allset']) assert.ok(by(s), s);
  assert.ok(!has(plan.consents, 'home-consent'));
  assert.ok(has(plan.consents, 'cohort') && has(plan.consents, 'peer-a'));
  assert.ok(has(plan.mouSignatures, 'home-questions') && !has(plan.guidingAnswers, 'home-questions'));
  assert.ok(!by('home-phone').phone && by('home-allset').phone && by('home-kickoff').phone);
  assert.ok(has(plan.guidingAnswers, 'home-kickoff'));
  const k = plan.cohorts.find((c) => c.slug === by('home-kickoff').cohort);
  assert.equal(k.timeline, new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10));
});

test('seeder never sends mail', () => {
  const dir = new URL('.', import.meta.url);
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'))) {
    const src = readFileSync(new URL(f, dir), 'utf8').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(src, /inviteUserByEmail|generateLink|resetPasswordForEmail/, f);
  }
});
