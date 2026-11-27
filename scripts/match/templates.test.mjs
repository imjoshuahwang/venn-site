import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KINDS, JSON_PATH, templatesJson, render, read } from './templates.mjs';

test('templates.json and the five previews are current (run node scripts/match/templates.mjs)', () => {
  assert.equal(readFileSync(JSON_PATH, 'utf8'), templatesJson());
  for (const k of KINDS) assert.equal(readFileSync(new URL(`../../supabase/templates/match-${k}.preview.html`, import.meta.url), 'utf8'), render(read(k)));
});

test('previews have no open slots and no 450+ or partner claims', () => {
  for (const k of KINDS) assert.doesNotMatch(render(read(k)), /\{\{|450|partner/i);
});
