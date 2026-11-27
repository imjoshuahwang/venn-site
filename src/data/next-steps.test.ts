import test from 'node:test';
import assert from 'node:assert/strict';
import { NEXT_STEPS, nextStepsFor, TRADEMARK_NOTICE } from './next-steps.ts';

test('aws config: two steps, legal copy, no logo, 3-4 prompts', () => {
  const c = nextStepsFor('aws');
  assert.equal(c.partner, 'aws');
  assert.equal(c.steps.length, 2);
  assert.equal(TRADEMARK_NOTICE, 'Amazon Web Services, AWS and the AWS logo are trademarks of Amazon.com, Inc. or its affiliates.');
  assert.ok(c.legal.includes(TRADEMARK_NOTICE));
  assert.ok(c.legal.some((l) => /logo/i.test(l) && /not|may not/i.test(l)));
  assert.ok(c.legal.some((l) => /real AWS staff/i.test(l)));
  assert.ok(c.prompts.length >= 3 && c.prompts.length <= 4);
  assert.match(c.subject, /AWS/);
  assert.ok(!('logo' in c) || !c.logo);
});

test('unknown partner falls back to aws; quadron slot exists for #229', () => {
  assert.equal(nextStepsFor('nope').partner, 'aws');
  assert.ok('aws' in NEXT_STEPS);
});
