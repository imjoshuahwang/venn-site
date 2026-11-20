import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_W, CARD_H, cardSpec, shareUrl } from './share-card.ts';

test('card is 9:16 at 1080x1920', () => {
  assert.equal(CARD_W, 1080);
  assert.equal(CARD_H, 1920);
});

test('first name only, never last name, email or phone', () => {
  const s = cardSpec({ name: 'Maya Lee', label: 'Teaching Tools' });
  const all = JSON.stringify(s);
  assert.equal(s.firstName, 'Maya');
  assert.equal(s.label, 'Teaching Tools');
  assert.ok(!/Lee/.test(all));
  assert.equal(cardSpec({ name: 'maya@school.edu', label: 'X' }).firstName, '');
  assert.equal(cardSpec({ name: '+1 415 555 0123', label: 'X' }).firstName, '');
  assert.ok(!/@|\d{3}/.test(JSON.stringify(cardSpec({ name: 'Sam', label: 'Reach me at a@b.co or 415 555 0123' }))));
});

test('label falls back to Venn Fall 26', () => {
  assert.equal(cardSpec({ name: 'Maya', label: '' }).label, 'Venn Fall 26');
  assert.equal(cardSpec({ name: 'Maya' }).label, 'Venn Fall 26');
});

test('share url is the public site root', () => {
  assert.equal(shareUrl('https://joinvenn.org'), 'https://joinvenn.org/');
  assert.equal(shareUrl('http://127.0.0.1:8129'), 'https://joinvenn.org/');
});
