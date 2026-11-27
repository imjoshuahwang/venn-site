// #225: /portal is one real page (heading + one button), the account button lives in the layout, the slideshow is gone.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');

test('home has one heading and one button to the result', () => {
  const s = read('src/pages/portal/index.astro');
  assert.equal((s.match(/<h1[ >]/g) ?? []).length, 1);
  assert.match(s, /Your results are here/);
  assert.match(s, /<a class="pill"[^>]*href="\/portal\/result"/);
  for (const gone of ['NextStep', 'TextJosh', 'loadHome', 'data-team', 'parent-request', '<details']) assert.doesNotMatch(s, new RegExp(gone), gone);
});

test('account button is a padded pill in the layout with the email and sign out', () => {
  const s = read('src/layouts/Portal.astro');
  assert.match(s, /\.topbar summary[^}]*border-radius: var\(--r-pill\)/);
  assert.match(s, /\.topbar summary[^}]*min-height: 44px/);
  assert.match(s, /action="\/portal\/logout"/);
});

test('the slideshow is deleted', () => {
  for (const f of ['src/scripts/portal/slides.ts', 'src/components/portal/results/CohortSlides.astro', 'src/data/cohort-decks.ts']) assert.equal(fs.existsSync(f), false, f);
  for (const f of ['src/pages/portal/result.astro', 'src/pages/portal/dev/result.astro', 'src/components/portal/results/Cohort.astro']) assert.doesNotMatch(read(f), /CohortSlides|data-slot="slides"|slot="slides"/, f);
});
