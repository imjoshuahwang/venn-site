import test from 'node:test';
import assert from 'node:assert/strict';
import { CONSENT_CLAUSES, CONSENT_VERSION, consentDefaults } from './consent.ts';

test('exactly the five clause ids', () => {
  assert.deepEqual(CONSENT_CLAUSES.map((c) => c.key).sort(), ['coordinator_groups', 'data_use', 'full_name_photo', 'highlights', 'retention']);
  assert.ok(CONSENT_VERSION.length > 0);
});

test('required flags and defaults', () => {
  const by = Object.fromEntries(CONSENT_CLAUSES.map((c) => [c.key, c]));
  for (const k of ['coordinator_groups', 'data_use', 'retention']) assert.equal(by[k].required, true);
  for (const k of ['highlights', 'full_name_photo']) assert.equal(by[k].required, false);
  assert.equal(by.highlights.default, true);
  assert.equal(by.full_name_photo.default, false);
  assert.deepEqual(consentDefaults(), { coordinator_groups: false, highlights: true, full_name_photo: false, data_use: false, retention: false });
});

test('copy carries the round-4 phrases', () => {
  const text = CONSENT_CLAUSES.map((c) => c.text).join('\n').toLowerCase();
  for (const p of ['no private dms', 'off-platform', 'first name, school and project results', 'never sold', 'only for your cohort',
    'ai may help read', 'anonymized aggregate', 'contact@joinvenn.org', 'no auto purge']) assert.ok(text.includes(p), p);
});
