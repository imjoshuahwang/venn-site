import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mouMode, formatSigned, logoUrl, MOU_TEXT, COHORT_COPY } from '../../src/data/mou.ts';

const read = (p) => fs.readFileSync(p, 'utf8');

test('Cohort DOM order: letter, details, slides slot, guidingQuestions slot, MouForm', () => {
  const s = read('src/components/portal/results/Cohort.astro');
  const body = s.slice(s.indexOf('<article'));
  const at = ['data-letter', 'data-details', 'data-slot="slides"', 'data-slot="guidingQuestions"', '<MouForm'].map((k) => body.indexOf(k));
  assert.ok(at.every((i) => i >= 0), 'all markers present');
  assert.deepEqual([...at].sort((a, b) => a - b), at);
});

test('mouMode: signature wins, then non-lead, then full, else sign', () => {
  const sig = { typed_name: 'A', signed_at: 't' };
  assert.equal(mouMode({ signature: sig, isLead: true }, true), 'signed');
  assert.equal(mouMode({ signature: sig, isLead: false }), 'signed');
  assert.equal(mouMode({ signature: null, isLead: false }, true), 'member');
  assert.equal(mouMode({ signature: null, isLead: true }, true), 'full');
  assert.equal(mouMode({ signature: null, isLead: true }), 'sign');
});

test('formatSigned is a stable UTC date and tolerates junk', () => {
  assert.equal(formatSigned('2026-11-18T23:59:00Z'), 'Nov 18, 2026');
  assert.equal(formatSigned('nope'), 'nope');
});

test('logoUrl: storage path, https passthrough, nothing else', () => {
  assert.equal(logoUrl('a/b.png', 'https://x.supabase.co/'), 'https://x.supabase.co/storage/v1/object/public/cohort-logos/a/b.png');
  assert.equal(logoUrl('https://cdn.example.com/l.png', 'https://x.supabase.co'), 'https://cdn.example.com/l.png');
  for (const [p, b] of [[null, 'https://x'], ['', 'https://x'], ['a.png', undefined], ['../a.png', 'https://x'], ['http://a/l.png', 'https://x']]) assert.equal(logoUrl(p, b), null);
});

test('copy is present and the MOU draft is short plain paragraphs', () => {
  assert.ok(MOU_TEXT.length >= 3 && MOU_TEXT.every((p) => p.length > 20 && p.length < 400));
  assert.equal(COHORT_COPY.logoAlt('Acme'), 'Acme logo');
});

test('fixture route covers every cohort state and the real page wires cohort', () => {
  const f = read('src/pages/portal/dev/result.astro');
  assert.match(f, /outcome === 'cohort'/);
  for (const st of ['signed', 'full', 'null', 'member']) assert.match(f, new RegExp(`'${st}'`));
  const i = read('src/pages/portal/index.astro');
  assert.match(i, /getCohortView/);
  assert.match(i, /<Cohort /);
});
