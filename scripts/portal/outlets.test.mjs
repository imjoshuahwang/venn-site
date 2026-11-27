// #172: six outlet cohorts exist as additive inserts with 6 slides each, (slides are row data only; the slideshow UI is gone, #226).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const sql = readFileSync(fileURLToPath(new URL('../../supabase/migrations/20261125010000_outlet_cohorts.sql', import.meta.url)), 'utf8');
const SLUGS = ['kinetic', 'mercator-post', 'to-be-obsolete', 'thebaytable', 'imperial-review', 'yvette-labs'];
const rows = [...sql.matchAll(/values \('([^']+)', '((?:[^']|'')*)', '((?:[^']|'')*)', '((?:[^']|'')*)', '((?:[^']|'')*)', '(\[.*?\])'::jsonb\)/gs)]
  .map((m) => ({ slug: m[1], name: m[2], company: m[3], goal: m[4], timeline: m[5], slides: JSON.parse(m[6].replace(/''/g, "'")) }));

test('migration is additive: only an add-column-if-not-exists and inserts', () => {
  assert.doesNotMatch(sql, /\b(drop|delete|update|truncate)\b/i);
  const alters = sql.match(/alter table[^;]*;/gi) ?? [];
  assert.equal(alters.length, 1);
  assert.match(alters[0], /add column if not exists slides jsonb/i);
});

test('all six outlets exist with six slides each and no contact info', () => {
  assert.deepEqual(rows.map((r) => r.slug), SLUGS);
  for (const r of rows) {
    assert.equal(r.slides.length, 6, r.slug);
    assert.deepEqual(r.slides.slice(3).map((s) => s.title), ['Your role', 'The timeline', 'Your first week']);
    const all = JSON.stringify(r.slides);
    assert.doesNotMatch(all, /phone|\d{3}[-. ]\d{3}[-. ]\d{4}|@/i, `${r.slug} leaks contact`);
    assert.doesNotMatch(all, /Venn article/i);
  }
});

