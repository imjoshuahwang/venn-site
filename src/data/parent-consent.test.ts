import test from 'node:test';
import assert from 'node:assert/strict';
import { parentView, parseParentState } from './parent-consent.ts';

const ctx = { first_name: 'Maya', cohort_name: 'Venn x Quadron Fall Cohort 2026' };

test('unsigned: names child and cohort, one sentence on Venn, plain list, full-width agree', () => {
  const v = parentView('ok', ctx);
  assert.equal(v.kind, 'sign');
  assert.match(v.title, /Maya/);
  assert.match(v.intro, /Venn x Quadron Fall Cohort 2026/);
  assert.match(v.about, /Venn is a network for ambitious high school students/);
  assert.ok(v.agree.length >= 3 && v.agree.length <= 5);
  assert.equal(v.button, 'I agree');
  assert.equal(v.mail, undefined);
});

test('unsigned without context still reads well', () => {
  const v = parentView('ok', null);
  assert.match(v.title, /your child/i);
  assert.doesNotMatch(JSON.stringify(v), /undefined|null/);
});

test('expired and unknown: what happened, how to get a new link, tappable mailto', () => {
  for (const s of ['expired', 'unknown'] as const) {
    const v = parentView(s, null);
    assert.equal(v.kind, 'expired');
    assert.match(v.body, /portal/i);
    assert.match(v.body, /new link/i);
    assert.equal(v.mail, 'mailto:contact@joinvenn.org');
    assert.equal(v.button, undefined);
  }
});

test('signed: says what happens next, nothing needed from the parent', () => {
  const v = parentView('used', ctx);
  assert.equal(v.kind, 'signed');
  assert.match(v.body, /told|let .* know/i);
  assert.match(v.body, /nothing else/i);
  assert.equal(v.button, undefined);
});

test('minors data: only first name and cohort name reach the page', () => {
  const raw = { first_name: 'Maya', cohort_name: 'Cohort', phone: '555', birthday: '2009-01-01', email: 'a@b.c' };
  const c = parseParentState({ state: 'ok', ...raw });
  assert.deepEqual(Object.keys(c.ctx ?? {}).sort(), ['cohort_name', 'first_name']);
  assert.doesNotMatch(JSON.stringify(parentView(c.state, c.ctx)), /555|2009|a@b\.c/);
});

test('parseParentState accepts the legacy plain string', () => {
  assert.deepEqual(parseParentState('used'), { state: 'used', ctx: null });
  assert.deepEqual(parseParentState(null), { state: 'unknown', ctx: null });
});
