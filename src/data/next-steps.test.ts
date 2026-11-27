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

test('unknown partner falls back to aws; quadron slot exists for #229', () => {
  assert.equal(nextStepsFor('nope').partner, 'aws');
  assert.ok('aws' in NEXT_STEPS);
});

test('done copy: Venn end state names what happens next', () => {
  const d = nextStepsFor('aws').done;
  assert.equal(d.title, "You're in");
  assert.ok(d.next.length === 2);
  assert.match(d.next[0], /WhatsApp/);
  assert.match(d.next[1], /kickoff/i);
});

test('partner lookup ignores prototype keys', () => {
  assert.equal(nextStepsFor('constructor').partner, 'aws');
  assert.equal(nextStepsFor('__proto__').partner, 'aws');
  assert.equal(nextStepsFor('toString').partner, 'aws');
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
