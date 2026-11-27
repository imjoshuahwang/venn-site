import { test } from 'node:test';
import assert from 'node:assert/strict';
import { awsDeck, quadronDeck, deckFor, awsEmail, quadronEmail } from './cohort-decks.ts';

const parse = (u: string) => { const [to, rest] = u.replace('mailto:', '').split('?'); const p = new URLSearchParams(rest); return { to, cc: p.get('cc'), subject: p.get('subject') ?? '', body: p.get('body') ?? '' }; };

test('quadron email goes to Dan with Josh copied and carries the first name', () => {
  const m = parse(quadronEmail({ firstName: 'Maya Lee' }));
  assert.equal(m.to, 'dan@quadron.work');
  assert.equal(m.cc, 'contact@joinvenn.org');
  assert.match(m.subject, /Maya/);
  assert.match(m.body, /here's what I'm building/i);
  assert.match(m.body, /\r\n/);
});

test('aws email goes to Josh with the template the spec asks for', () => {
  const m = parse(awsEmail({ firstName: 'Sam' }));
  assert.equal(m.to, 'contact@joinvenn.org');
  assert.equal(m.cc, null);
  assert.match(m.body, /^Hey, this is what I'm building\./);
  assert.match(m.body, /Here's one idea I have with AWS/);
});

test('emails still work without a name', () => {
  assert.doesNotMatch(parse(quadronEmail()).subject, /undefined|null/);
  assert.match(parse(quadronEmail()).body, /\[your name\]/);
});

test('each deck ends in its email button and nothing else has one', () => {
  for (const d of [awsDeck(), quadronDeck()]) {
    assert.equal(d.filter((s) => s.cta).length, 1);
    assert.ok(d.at(-1)!.cta!.href.startsWith('mailto:'));
  }
});

test('the aws deck carries the engineer video with a poster; quadron has none', () => {
  assert.equal(awsDeck().filter((s) => s.video).length, 1);
  assert.equal(quadronDeck().filter((s) => s.video).length, 0);
});

test('both decks keep the aligned-not-sponsored rule and never promise anything', () => {
  for (const [c, d] of [['AWS', awsDeck()], ['Quadron', quadronDeck()]] as const) {
    const all = d.map((s) => `${s.big} ${s.sub ?? ''}`).join(' ');
    assert.match(all, new RegExp(`Never use its logo`));
    assert.match(all, new RegExp(`${c} does not sponsor it`));
    assert.match(all, /top 10%/);
  }
});

test('deckFor only knows the two batch 1 slugs', () => {
  assert.ok(deckFor('aws')); assert.ok(deckFor('quadron'));
  assert.equal(deckFor('kinetic'), null); assert.equal(deckFor(undefined), null);
});
