// #225: /portal is one real page (heading + one button), the account button lives in the layout, the slideshow is gone.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');

test('home has one heading and one button to the result', () => {
  const s = read('src/pages/portal/index.astro');
  assert.equal((s.match(/<h1[ >]/g) ?? []).length, 3); // home, none and error states, never together
  assert.match(s, /Your results are here/);
  assert.match(s, /<a class="pill"[^>]*href="\/portal\/result"/);
  for (const gone of ['NextStep', 'TextJosh', 'data-team', 'parent-request', '<details']) assert.doesNotMatch(s, new RegExp(gone), gone);
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

test('home reads go through loadHome (parallel) and vercel runs in sfo1', () => {
  assert.match(read('src/pages/portal/index.astro'), /loadHome\(/);
  assert.deepEqual(JSON.parse(read('vercel.json')).regions, ['sfo1']);
});

test('none state names the email, offers a different sign-in and the contact address; error offers Try again and logs nothing', () => {
  const s = read('src/pages/portal/index.astro');
  assert.match(s, /We could not find a result for \{email\}/);
  assert.match(s, /Sign in with a different email/);
  assert.match(s, /contact@joinvenn\.org/);
  assert.match(s, /data-retry/);
  assert.doesNotMatch(s, /console\./);
  assert.doesNotMatch(s, /could not find an application/);
});

test('post-reveal home: partner name as text (no logo until #241), next step link, Watch again replays without writes', () => {
  const s = read('src/pages/portal/index.astro');
  assert.match(s, /data-cohort-name/);
  assert.match(s, /href="\/portal\/next-steps"/);
  assert.match(s, /href="\/portal\?replay=1"[^>]*data-watch-again/);
  assert.doesNotMatch(s, /<img/);
  const c = read('src/components/portal/Ceremony.astro');
  assert.match(c, /if \(replay\) return;/);
});
