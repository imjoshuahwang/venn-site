import test from 'node:test';
import assert from 'node:assert/strict';
import { gmailComposeUrl, mailtoUrl } from './gmail.ts';

test('gmailComposeUrl: to, cc, subject set; body round-trips with newlines and &', () => {
  const body = 'Hi Venn,\nWe are A&B Club = 10 people?\n\nThanks #1 100%';
  const raw = gmailComposeUrl({ subject: 'Venn x AWS: intro & plan', body });
  assert.ok(raw.startsWith('https://mail.google.com/mail/?view=cm&fs=1&'));
  const u = new URL(raw);
  assert.equal(u.searchParams.get('view'), 'cm');
  assert.equal(u.searchParams.get('fs'), '1');
  assert.equal(u.searchParams.get('to'), 'contact@joinvenn.org');
  assert.equal(u.searchParams.get('cc'), 'imjoshuahwang@gmail.com');
  assert.equal(u.searchParams.get('su'), 'Venn x AWS: intro & plan');
  assert.equal(u.searchParams.get('body'), body);
  const q = raw.split('?')[1];
  assert.ok(!/\n/.test(raw));
  assert.equal(q.split('&').length, 6, 'no raw & inside values');
  assert.ok(raw.includes('%0A') && raw.includes('%26'));
});

test('gmailComposeUrl: overrides to/cc', () => {
  const u = new URL(gmailComposeUrl({ subject: 's', body: 'b', to: 'a@x.org', cc: 'c@x.org' }));
  assert.equal(u.searchParams.get('to'), 'a@x.org');
  assert.equal(u.searchParams.get('cc'), 'c@x.org');
});

test('mailtoUrl: same to, cc, subject, body as Gmail; CRLF-safe encoding', () => {
  const body = 'Hi,\nA&B Club?\n\nThanks #1 100%';
  const g = new URL(gmailComposeUrl({ subject: 'S & T', body }));
  const raw = mailtoUrl({ subject: 'S & T', body });
  assert.ok(raw.startsWith('mailto:contact@joinvenn.org?'));
  const u = new URL(raw);
  assert.equal(u.searchParams.get('cc'), g.searchParams.get('cc'));
  assert.equal(u.searchParams.get('subject'), g.searchParams.get('su'));
  assert.equal(u.searchParams.get('body'), g.searchParams.get('body'));
  assert.ok(!/\n|\+/.test(raw), 'spaces are %20, not +');
});
