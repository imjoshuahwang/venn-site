import test from 'node:test';
import assert from 'node:assert/strict';
import { TEST_APPLICANTS, approvedRow } from './seed-test-results.mjs';

test('every test applicant mails a plus address of the owner and is one journey', () => {
  for (const a of TEST_APPLICANTS) assert.match(a.email, /^imjoshuahwang\+[a-z0-9]+@gmail\.com$/);
  assert.deepEqual(TEST_APPLICANTS.map((a) => a.outcome).sort(), ['cohort', 'cohort', 'not_this_season', 'peer', 'peer']);
  const peers = TEST_APPLICANTS.filter((a) => a.partner);
  for (const p of peers) assert.equal(TEST_APPLICANTS.find((x) => x.slug === p.partner).partner, p.slug);
});

test('rows are approved, unsent and carry no real cohort for peer or nts', () => {
  const r = approvedRow(TEST_APPLICANTS[2], 9, undefined);
  assert.equal(r.status, 'approved'); assert.equal(r.emailed_at, null); assert.equal(r.cohort_id, null);
});
