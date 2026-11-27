import test from 'node:test';
import assert from 'node:assert/strict';
import { NEXT_STEPS, nextStepsFor, TRADEMARK_NOTICE } from './next-steps.ts';

test('aws config: two steps, legal copy, no logo, 3-4 prompts', () => {
  const c = nextStepsFor('aws');
  assert.equal(c.partner, 'aws');
  assert.equal(c.steps.length, 2);
  assert.equal(TRADEMARK_NOTICE, 'Amazon Web Services, AWS and the AWS logo are trademarks of Amazon.com, Inc. or its affiliates.');
  assert.ok(c.legal.includes(TRADEMARK_NOTICE));
  assert.ok(c.legal.some((l) => /AWS logo/.test(l) && /slides/i.test(l) && /promotions/i.test(l)));
  assert.ok(c.legal.some((l) => /AWS staff worked directly with Venn/i.test(l) && /informal association/i.test(l)));
  assert.ok(c.prompts.length >= 3 && c.prompts.length <= 4);
  assert.match(c.subject, /AWS/);
  assert.ok(!('logo' in c) || !c.logo);
});

test('unknown or missing partner falls back to neutral Venn, never AWS or Quadron', () => {
  for (const k of ['nope', undefined, null, '']) {
    const c = nextStepsFor(k);
    assert.equal(c.partner, 'venn');
    assert.doesNotMatch(JSON.stringify(c), /aws|amazon|quadron/i);
  }
});
test('quadron config: official logo, no-logo-use line, informal association, no AWS or Amazon', () => {
  const c = nextStepsFor('quadron');
  assert.equal(c.logo, '/logos/quadron.svg');
  assert.ok(c.legal.some((l) => /Quadron logo/.test(l) && /slides/i.test(l) && /promotions/i.test(l)));
  assert.ok(c.legal.some((l) => /informal association/i.test(l)));
  assert.doesNotMatch(JSON.stringify(c), /aws|amazon/i);
});

test('done copy: Venn end state names what happens next', () => {
  const d = nextStepsFor('aws').done;
  assert.equal(d.title, "You're in");
  assert.ok(d.next.length === 2);
  assert.match(d.next[0], /WhatsApp/);
  assert.match(d.next[1], /kickoff/i);
});

test('partner lookup ignores prototype keys', () => {
  assert.equal(nextStepsFor('constructor').partner, 'venn');
  assert.equal(nextStepsFor('__proto__').partner, 'venn');
  assert.equal(nextStepsFor('toString').partner, 'venn');
});

test('no user-facing copy says partner or partnership', () => {
  for (const c of Object.values(NEXT_STEPS)) {
    const strings = [...c.steps, ...c.legal, ...c.prompts, c.subject, c.done.title, c.done.lead, ...c.done.next];
    for (const s of strings) assert.doesNotMatch(s, /partner/i, s);
  }
});

test('aws config never mentions Quadron', () => {
  const c = NEXT_STEPS.aws;
  const strings = [...c.steps, ...c.legal, ...c.prompts, c.subject, c.done.title, c.done.lead, ...c.done.next];
  for (const s of strings) assert.doesNotMatch(s, /quadron/i, s);
});
