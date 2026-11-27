import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMailto, expectMailto, pairedIpRow, rateKey } from './results-journeys.mjs';

test('parseMailto reads to and cc', () => {
  assert.deepEqual(parseMailto('mailto:Dan@Quadron.work?cc=contact@joinvenn.org&subject=Hi'), { to: 'dan@quadron.work', cc: 'contact@joinvenn.org' });
  assert.deepEqual(parseMailto('mailto:contact@joinvenn.org'), { to: 'contact@joinvenn.org', cc: null });
});

test('expectMailto needs the exact to and cc', () => {
  const want = { to: 'dan@quadron.work', cc: 'contact@joinvenn.org' };
  assert.equal(expectMailto(['mailto:dan@quadron.work?cc=contact@joinvenn.org'], want).ok, true);
  assert.equal(expectMailto(['mailto:contact@joinvenn.org'], want).ok, false);
});

test('reachOk wants the button inside the viewport and, on a phone, below the top 40%', async () => {
  const { reachOk } = await import('./results-journeys.mjs');
  const vp = { width: 390, height: 844 };
  assert.equal(reachOk({ x: 20, y: 700, width: 350, height: 52 }, vp, true).ok, true);
  assert.equal(reachOk({ x: 20, y: 100, width: 350, height: 52 }, vp, true).ok, false);
  assert.equal(reachOk({ x: 20, y: 100, width: 350, height: 52 }, vp, false).ok, true);
  assert.equal(reachOk({ x: 20, y: 820, width: 350, height: 52 }, vp, true).ok, false);
  assert.equal(reachOk(null, vp, true).ok, false);
});

test('rateKey hashes like ratelimit.ts rpcStore', async () => {
  const { createHash } = await import('node:crypto');
  assert.equal(rateKey('login:email:a@b.c'), createHash('sha256').update('login:email:a@b.c').digest('hex').slice(0, 32));
});

test('pairedIpRow takes the row written in the same request, else nothing', () => {
  const e = { hit_at: '2026-11-26T10:00:00.500Z' };
  assert.equal(pairedIpRow(e, { key: 'ip', hit_at: '2026-11-26T10:00:00.300Z' }), 'ip');
  assert.equal(pairedIpRow(e, { key: 'other', hit_at: '2026-11-26T09:58:00.000Z' }), null);
  assert.equal(pairedIpRow(null, null), null);
});
