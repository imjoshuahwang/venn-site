import test from 'node:test';
import assert from 'node:assert/strict';
import { CONSENT_CLAUSES, CONSENT_DRAFT, CONSENT_PAGES, CONSENT_VERSION } from './consent.ts';

test('exactly the five clause ids, version v3, still marked DRAFT', () => {
  assert.deepEqual(CONSENT_CLAUSES.map((c) => c.key).sort(), ['coordinator_groups', 'data_use', 'full_name_photo', 'highlights', 'retention']);
  assert.equal(CONSENT_VERSION, '2026-11-v3');
  assert.equal(CONSENT_DRAFT, true, 'flip only after the lawyer signs off (#191)');
});

test('required flags and defaults', () => {
  const by = Object.fromEntries(CONSENT_CLAUSES.map((c) => [c.key, c]));
  for (const k of ['coordinator_groups', 'data_use', 'retention']) assert.equal(by[k].required, true);
  for (const k of ['highlights', 'full_name_photo']) assert.equal(by[k].required, false);
  assert.equal(by.highlights.default, true);
  assert.equal(by.full_name_photo.default, false);
});

test('every page has a plain summary above full text, and the last page is the confirm page', () => {
  assert.ok(CONSENT_PAGES.length >= 8);
  assert.equal(new Set(CONSENT_PAGES.map((p) => p.id)).size, CONSENT_PAGES.length);
  for (const p of CONSENT_PAGES) {
    assert.ok(p.summary.length > 20 && p.summary.length < 200, `${p.id} summary`);
    assert.ok(p.body.join(' ').length > p.summary.length, `${p.id} full text`);
  }
  assert.equal(CONSENT_PAGES.at(-1)!.id, 'confirm');
  assert.deepEqual(CONSENT_PAGES.flatMap((p) => p.choices ?? []).sort(), ['full_name_photo', 'highlights']);
});

test('copy covers every topic in #191', () => {
  const text = CONSENT_PAGES.map((p) => p.body.join(' ')).join('\n').toLowerCase();
  for (const p of ['parent or legal guardian', 'aligned', 'does not mean sponsored', 'endorses', 'logo', 'never sell', 'only for your cohort', 'private dms', 'off-platform',
    'ai may help read', 'anonymized', 'contact@joinvenn.org', 'no automatic purge', 'top 10%', 'does not guarantee', 'cloud credits', 'mentorship', 'liable']) assert.ok(text.includes(p), p);
  assert.ok(CONSENT_CLAUSES.find((c) => c.key === 'highlights')!.text.toLowerCase().includes('first name, school and project results'));
});

test('no postal address anywhere in the terms', () => {
  const all = JSON.stringify([CONSENT_PAGES, CONSENT_CLAUSES]);
  assert.doesNotMatch(all, /\b\d{1,5}\s+[A-Z][a-z]+\s+(Street|St\.?|Ave|Avenue|Road|Rd|Blvd|Drive|Dr|Lane|Ln)\b/);
  assert.doesNotMatch(all, /\b(P\.?O\.? Box|San Jose, CA)\b/i);
});
