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

test('only the cohort outcome gets the reveal; waitlist, not_this_season and peer render directly', () => {
  const src = fs.readFileSync(new URL('../pages/portal/result.astro', import.meta.url), 'utf8');
  assert.equal(src.match(/<CohortReveal/g)?.length, 1);
  const cohortBranch = src.slice(src.indexOf("result?.outcome === 'cohort' ? <>"), src.indexOf("result?.outcome === 'peer' ? <Peer"));
  assert.match(cohortBranch, /<CohortReveal/);
  const rest = src.slice(src.indexOf("result?.outcome === 'peer' ? <Peer"));
  assert.doesNotMatch(rest, /CohortReveal/);
  for (const f of ['Waitlist', 'NotThisSeason', 'Peer']) {
    assert.doesNotMatch(fs.readFileSync(new URL(`../components/portal/results/${f}.astro`, import.meta.url), 'utf8'), /data-reveal|STOOD_OUT|stood out/i);
  }
});

test('rendered reveal copy never says partner or partnership', () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|\/\/.*|<!--[\s\S]*?-->/g, '');
  const html = strip(fs.readFileSync(new URL('../components/portal/results/CohortReveal.astro', import.meta.url), 'utf8')).split('<script>')[0].replace(/^---[\s\S]*?---/, '').replace(/\{[^{}]*\}/g, '');
  assert.doesNotMatch(html, /partner/i);
  const copy = [statLine(), STOOD_OUT, ...Object.values(PARTNERS).flatMap((p) => [popupTitle(p), p.name, p.cohortTitle, `${p.name} logo`])].join(' ');
  assert.doesNotMatch(copy, /partner/i);
});
