import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildSlides, stepIndex } from '../../src/scripts/portal/slides.ts';
import { GUIDING_QUESTIONS } from '../../src/data/guiding.ts';

const row = { company: 'Zed Co', name: 'Cohort', goal: 'Ship it', timeline: 'Fall' };
test('slides come only from row fields', () => {
  const s = buildSlides(row, 'https://x/l.png');
  assert.deepEqual(s.map((x) => x.id), ['partner', 'goal', 'timeline']);
  assert.equal(s[0].body, 'Zed Co'); assert.equal(s[0].logo, 'https://x/l.png'); assert.equal(s[1].body, 'Ship it');
});
test('missing fields drop their slide', () => {
  assert.deepEqual(buildSlides({ ...row, goal: ' ' }).map((x) => x.id), ['partner', 'timeline']);
  assert.deepEqual(buildSlides({ goal: 'g' }).map((x) => x.id), ['goal']);
  assert.deepEqual(buildSlides(null), []);
});
test('stepIndex clamps', () => {
  assert.equal(stepIndex(0, 3, -1), 0); assert.equal(stepIndex(2, 3, 1), 2); assert.equal(stepIndex(0, 3, 1), 1);
});
test('no partner names hardcoded in slide sources', () => {
  for (const f of ['src/scripts/portal/slides.ts', 'src/components/portal/results/CohortSlides.astro']) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /Lincoln|Teaching Tools|Acme/i);
});
test('slideshow honors reduced motion, 44px controls, focus ring', () => {
  const s = fs.readFileSync('src/components/portal/results/CohortSlides.astro', 'utf8');
  assert.match(s, /prefers-reduced-motion: reduce/); assert.match(s, /scroll-behavior: auto/);
  assert.match(s, /min-height: 44px/); assert.match(s, /min-width: 44px/); assert.match(s, /:focus-visible/);
  assert.match(s, /ArrowRight/); assert.match(s, /scroll-snap-type/);
});
test('guiding form: 3 questions, states, 44px, wired into Cohort slots', () => {
  const g = fs.readFileSync('src/components/portal/GuidingQuestions.astro', 'utf8');
  assert.match(g, /data-guiding/); assert.match(g, /role="alert"/); assert.match(g, /min-height: 44px/); assert.match(g, /:focus-visible/);
  assert.equal(GUIDING_QUESTIONS.length, 3);
  for (const f of ['src/pages/portal/result.astro','src/pages/portal/dev/result.astro']) {
    const p = fs.readFileSync(f, 'utf8'); assert.match(p, /slot="slides"/); assert.match(p, /slot="guidingQuestions"/);
  }
});
