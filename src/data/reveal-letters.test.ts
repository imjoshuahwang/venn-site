import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lettersFor, DAN_EMAIL } from './reveal-letters.ts';
import { SHARE_TEXT, intentUrl, cohortLine, SIZES } from '../lib/portal/letter-share.ts';

const text = (slug: string, seatCap?: number | null) => lettersFor(slug, { seatCap })!.flatMap((s) => [s.title, s.lead ?? '', ...s.paragraphs, ...(s.list ?? []).map((x) => x.head + ' ' + x.text)]).join('\n');

test('aws letter takes its seat count from the cohort, never a literal', () => {
  assert.match(text('aws', 10), /one of ten students/);
  assert.match(text('aws', 7), /one of seven students/);
  assert.doesNotMatch(text('aws', null), /one of (ten|twenty|\d+) students/);
  assert.match(text('quadron', 20), /one of 20 students/);
  const src = readFileSync(new URL('./reveal-letters.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\b(ten|10|twenty|20) students/);
});
test('aws letter names four real principles and never says partner', () => {
  const t = text('aws', 10);
  for (const p of ['Learn and Be Curious', 'Bias for Action', 'Think Big', 'Earn Trust']) assert.match(t, new RegExp(p));
  assert.doesNotMatch(t, /partner/i);
});
test('quadron letter ends on Email Dan and never mentions AWS', () => {
  const s = lettersFor('quadron', { seatCap: 20 })!;
  assert.equal(s.at(-1)!.title, 'Email Dan.');
  assert.match(s.at(-1)!.action!.href, /^mailto:/);
  assert.doesNotMatch(text('quadron', 20), /aws|amazon|partner/i);
});
test('unknown cohort has no letter', () => { for (const k of ['cohort', 'constructor', '__proto__']) assert.equal(lettersFor(k, {}), null); });
test('share text and LinkedIn intent', () => {
  assert.equal(SHARE_TEXT, 'I got accepted into Venn Fall 2026');
  const u = new URL(intentUrl());
  assert.equal(u.origin + u.pathname, 'https://www.linkedin.com/feed/');
  assert.equal(u.searchParams.get('shareActive'), 'true');
  assert.equal(u.searchParams.get('text'), SHARE_TEXT);
});
test('dual card names both cohorts; sizes match the contract', () => {
  assert.equal(cohortLine(['AWS', 'Quadron']), 'AWS and Quadron');
  assert.equal(cohortLine(['AWS']), 'AWS');
  assert.deepEqual(SIZES, { square: { w: 1200, h: 1200 }, wide: { w: 1200, h: 627 } });
});

test('Email Dan falls back to the example.com placeholder when no env var is set', () => {
  assert.equal(DAN_EMAIL, 'dan@example.com');
  const a = lettersFor('quadron', { seatCap: 20 })!.find((s) => s.action?.label === 'Email Dan')!.action!;
  assert.ok(a.href.startsWith('mailto:dan@example.com?'));
});
