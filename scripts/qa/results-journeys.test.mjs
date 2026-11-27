import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMailto, expectMailto } from './results-journeys.mjs';

test('parseMailto reads to and cc', () => {
  assert.deepEqual(parseMailto('mailto:Dan@Quadron.work?cc=contact@joinvenn.org&subject=Hi'), { to: 'dan@quadron.work', cc: 'contact@joinvenn.org' });
  assert.deepEqual(parseMailto('mailto:contact@joinvenn.org'), { to: 'contact@joinvenn.org', cc: null });
});

test('expectMailto needs the exact to and cc', () => {
  const want = { to: 'dan@quadron.work', cc: 'contact@joinvenn.org' };
  assert.equal(expectMailto(['mailto:dan@quadron.work?cc=contact@joinvenn.org'], want).ok, true);
  assert.equal(expectMailto(['mailto:contact@joinvenn.org'], want).ok, false);
});
