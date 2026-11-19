import test from 'node:test';
import assert from 'node:assert/strict';
import { isMinor } from './consent.ts';

test('isMinor is true only for high_school applicants', () => {
  assert.equal(isMinor({ level: 'high_school' }), true);
  assert.equal(isMinor({ level: 'college' }), false);
  assert.equal(isMinor({ level: 'other' }), false);
  assert.equal(isMinor({ level: null }), false);
  assert.equal(isMinor(null), false);
});

import { readFileSync } from 'node:fs';
test('home load-error offers a Retry that re-requests /portal', () => {
  const src = readFileSync(new URL('../../pages/portal/index.astro', import.meta.url), 'utf8');
  assert.match(src, /action="\/portal"[^>]*><button[^>]*data-retry>Retry<\/button>/);
});
