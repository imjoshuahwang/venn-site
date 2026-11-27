import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { MATCH_FACTS, searchLine } from './match-facts.ts';

const facts = [process.env.VENN_FACTS, `${os.homedir()}/venn/venn-facts.md`].find((p) => p && fs.existsSync(p));

test('stage numbers equal the venn-facts.md values', { skip: !facts && 'venn-facts.md not on this machine' }, () => {
  const md = fs.readFileSync(facts!, 'utf8');
  assert.match(md, new RegExp(`worked with ${MATCH_FACTS.orgs} partner organizations`));
  assert.match(md, new RegExp(`${MATCH_FACTS.students.toLocaleString('en-US')} students worldwide across ${MATCH_FACTS.countries} countries`));
});

test('search line carries the three numbers and never calls AWS a partner', () => {
  assert.equal(searchLine(), 'Searching 223 partner organizations across 21 countries, reaching 500,320 students');
  assert.doesNotMatch(searchLine(), /22 countries|450/);
  assert.equal(MATCH_FACTS.countries, 21);
});
