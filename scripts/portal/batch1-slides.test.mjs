import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AWS_SLIDES, QUADRON_SLIDES, slidesSql } from '../../src/data/batch1-slides.ts';
import { buildSlides } from '../../src/scripts/portal/slides.ts';

for (const [name, slides, c] of [['aws', AWS_SLIDES, 'AWS'], ['quadron', QUADRON_SLIDES, 'Quadron']]) {
  test(`${name} slides: 5-7, rule and contact present, text-only name, no invented numbers`, () => {
    assert.ok(slides.length >= 5 && slides.length <= 7);
    const all = slides.map((s) => `${s.title} ${s.body}`).join('\n');
    assert.match(all, new RegExp(`not sponsored by ${c}`));
    assert.match(all, /never use the .* logo/);
    assert.match(all, /contact@joinvenn\.org/);
    assert.match(all, /top 10%/);
    assert.match(all, /cannot guarantee/);
    assert.deepEqual(all.match(/\d+/g)?.filter((n) => !['10', '1', '2', '3', '4'].includes(n)) ?? [], []);
    assert.equal(buildSlides({ slides }).length, slides.length);
  });
}

test('migration carries exactly the slides in the data file', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261126010000_batch1_slides.sql', import.meta.url), 'utf8');
  assert.ok(sql.includes(slidesSql()));
});
