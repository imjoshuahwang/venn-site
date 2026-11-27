import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARTNERS, userFacingStrings } from './reveal-partners.ts';
import { cardLines, linkedinAllowed } from '../lib/portal/accept-card.ts';

const aws = PARTNERS.aws;
test('no user-facing string says partner, 21%, agentic engineering or small engine', () => {
  for (const s of userFacingStrings(aws)) assert.doesNotMatch(s, /partner|21%|agentic engineering|small engine/i, s);
});
test('share card text has no digits except the year', () => {
  const lines = cardLines({ headline: aws.copy!.card.headline, title: aws.copy!.card.sub(aws.cohortTitle), org: 'Lincoln High Robotics Club', partnerName: aws.name, partnerLogo: '', vennLogo: '' });
  for (const l of lines) assert.equal(l.replace(/2026/g, '').match(/\d/), null, l);
});
test('LinkedIn is hidden under 16 by birthday and shown at 16 or unknown', () => {
  const today = new Date('2026-11-27T12:00:00Z');
  assert.equal(linkedinAllowed('2011-06-01', today), false);
  assert.equal(linkedinAllowed('2010-11-28', today), false);
  assert.equal(linkedinAllowed('2010-11-27', today), true);
  assert.equal(linkedinAllowed(null, today), true);
});
test('quadron has a logo and no copy until #229', () => {
  assert.equal(PARTNERS.quadron.logo, '/logos/quadron.svg');
  assert.equal(PARTNERS.quadron.copy, undefined);
});
test('aws copy never mentions Quadron', () => {
  for (const s of userFacingStrings(aws)) assert.doesNotMatch(s, /quadron/i, s);
});
