import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GUIDING_QUESTIONS } from '../../src/data/guiding.ts';

test('guiding form: 3 questions, states, 44px, wired into Cohort slots', () => {
  const g = fs.readFileSync('src/components/portal/GuidingQuestions.astro', 'utf8');
  assert.match(g, /data-guiding/); assert.match(g, /role="alert"/); assert.match(g, /min-height: 44px/); assert.match(g, /:focus-visible/);
  assert.equal(GUIDING_QUESTIONS.length, 3);
  for (const f of ['src/pages/portal/result.astro','src/pages/portal/dev/result.astro']) {
    const p = fs.readFileSync(f, 'utf8'); assert.match(p, /slot="guidingQuestions"/);
  }
});
