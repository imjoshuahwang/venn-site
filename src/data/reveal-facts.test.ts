import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { statLine, REVEAL_FACTS, STOOD_OUT } from './reveal-facts.ts';
import { PARTNERS, partnerFor, popupTitle } from './reveal-partners.ts';

test('stat line carries the facts-file numbers and all six past partners', () => {
  const s = statLine();
  for (const t of ['500,320', '21 countries', 'Microsoft', 'Yale', 'Stanford', 'Harvard', 'Princeton', 'UC Berkeley']) assert.ok(s.includes(t), t);
  assert.doesNotMatch(s, /22 countries|%/);
  assert.equal(STOOD_OUT, 'But you stood out.');
});

test('stat module source never says 22 countries or 9%', () => {
  const src = fs.readFileSync(new URL('./reveal-facts.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /22 countries|%/);
  assert.match(src, /venn-facts\.md/);
  assert.equal(REVEAL_FACTS.students, 500320);
});

test('popup title is config driven, AWS and Quadron are entries not forks', () => {
  assert.equal(popupTitle(PARTNERS.aws), 'Welcome to Venn x AWS Fall Cohort 2026');
  assert.equal(popupTitle(PARTNERS.quadron), 'Welcome to Venn x Quadron Fall Cohort 2026');
  assert.equal(PARTNERS.aws.logo, '/logos/aws.svg');
  assert.equal(partnerFor('aws'), PARTNERS.aws);
  assert.equal(partnerFor('nope'), null);
  assert.equal(partnerFor(undefined), null);
});

test('slideshow is gone', () => {
  assert.equal(fs.existsSync(new URL('../scripts/portal/slides.ts', import.meta.url)), false);
  assert.equal(fs.existsSync(new URL('../components/portal/results/CohortSlides.astro', import.meta.url)), false);
});
