import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARTNERS, userFacingStrings, partnerFor, popupTitle } from './reveal-partners.ts';
import { cardLines, linkedinAllowed } from '../lib/portal/accept-card.ts';

const aws = PARTNERS.aws;
test('no user-facing string says partner, 21%, agentic engineering or small engine', () => {
  for (const s of userFacingStrings(aws)) assert.doesNotMatch(s, /partner|21%|agentic engineering|small engine/i, s);
});
test('share card text has no digits except the year', () => {
  const lines = cardLines({ headline: aws.copy!.card.headline, title: aws.copy!.card.sub(aws.cohortTitle), org: 'Lincoln High Robotics Club', partnerName: aws.name, partnerLogo: '', vennLogo: '' });
  for (const l of lines) assert.equal(l.replace(/2026/g, '').match(/\d/), null, l);
});
test('LinkedIn is hidden under 16 by birthday and shown only at 16 or older, and an unknown birthday hides it', () => {
  const today = new Date('2026-11-27T12:00:00Z');
  assert.equal(linkedinAllowed('2011-06-01', today), false);
  assert.equal(linkedinAllowed('2010-11-28', today), false);
  assert.equal(linkedinAllowed('2010-11-27', today), true);
  assert.equal(linkedinAllowed(null, today), false);
  assert.equal(linkedinAllowed(undefined, today), false);
  assert.equal(linkedinAllowed('not a date', today), false);
});
const quad = PARTNERS.quadron;
test('quadron: official logo, informal wording, Dan note with a compose action, no banned words', () => {
  assert.equal(quad.logo, '/logos/quadron.svg');
  for (const s of userFacingStrings(quad)) assert.doesNotMatch(s, /partner|aws|amazon/i, s);
  assert.match(quad.copy!.association, /informal association/);
  const d = quad.copy!.letter.dan!;
  assert.match(d.text, /Dan Pratl wants to talk to you/);
  assert.equal(d.linkHref, 'https://pratl.me');
  assert.match(d.subject, /talk to Dan/);
});
test('unknown or missing partner is the neutral Venn reveal, never AWS or Quadron', () => {
  for (const slug of [undefined, null, '', 'nope', 'constructor', '__proto__', 42]) {
    const p = partnerFor(slug);
    assert.equal(p.key, 'venn');
    assert.equal(p.copy, undefined);
    for (const s of [popupTitle(p), p.name, p.logo]) assert.doesNotMatch(s, /aws|amazon|quadron|partner/i, s);
  }
});
test('aws copy never mentions Quadron', () => {
  for (const s of userFacingStrings(aws)) assert.doesNotMatch(s, /quadron/i, s);
});
