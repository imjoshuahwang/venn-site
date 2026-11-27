import test from 'node:test';
import assert from 'node:assert/strict';
import { gmailComposeUrl } from './gmail.ts';

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
