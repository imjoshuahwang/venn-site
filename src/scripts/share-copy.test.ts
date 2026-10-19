import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LINKEDIN_POSTS, SMS_TEXTS, VENN_LINKEDIN, FRIEND_EMAILS, variantIndex, nextVariant, fill,
  isLinkedInPostUrl, normalizePostUrl, timeLeft,
} from './share-copy.ts';

const BANNED = ['delve', 'utilize', 'facilitate', 'robust', 'enhance', 'crucial', 'vital', 'streamline', 'empower',
  'elevate', 'embark', 'unlock', 'harness', 'seamless', 'pivotal', 'foster', 'leverage', 'synergy', 'impactful',
  'innovative', 'passionate', 'thrilled', 'eager', 'amazing', 'incredible', 'journey', 'landscape', 'ecosystem',
  'space', 'opportunity', 'excited'];

test('LinkedIn posts: 25-30, unique, blank sentence, one link, one @Venn', () => {
  assert.equal(LINKEDIN_POSTS.length, 28);
  assert.ok(LINKEDIN_POSTS.length >= 25 && LINKEDIN_POSTS.length <= 30);
  assert.equal(new Set(LINKEDIN_POSTS).size, LINKEDIN_POSTS.length);
  for (const p of LINKEDIN_POSTS) {
    assert.ok(p.includes("I'm building {blank}."), p);
    assert.equal(p.split('{link}').length - 1, 1, p);
    assert.equal(p.split('@Venn').length - 1, 1, p);
    assert.ok(!p.includes('\u2014') && !p.includes('!'), p);
    assert.ok((p.match(/#\w+/g) ?? []).length <= 1, p);
    assert.ok(!/\p{Extended_Pictographic}/u.test(p), p);
    for (const w of BANNED) assert.ok(!new RegExp('\\b' + w + '\\b', 'i').test(p), w + ' in ' + p);
    for (const d of p.match(/\d+(?:,\d{3})*K?\+?/g) ?? []) {
      assert.ok(['141', '500', '500K', '500K+', '500,320', '21', '26'].includes(d), d + ' in ' + p);
    }
  }
});

test('LinkedIn posts: no two share a first line', () => {
  const first = LINKEDIN_POSTS.map((p) => p.split('\n')[0]);
  assert.equal(new Set(first).size, first.length);
});

test('SMS texts: 5, each with a link and no tag or blank', () => {
  assert.equal(SMS_TEXTS.length, 5);
  for (const t of SMS_TEXTS) {
    assert.ok(t.includes('{link}'));
    assert.ok(!t.includes('@Venn') && !t.includes('{blank}'));
  }
});

test('Venn LinkedIn page config', () => {
  assert.ok(VENN_LINKEDIN.name.length > 0);
  assert.ok(VENN_LINKEDIN.url.startsWith('https://'));
});

test('friend emails: 3 with subject, link and name', () => {
  assert.equal(FRIEND_EMAILS.length, 3);
  assert.deepEqual(FRIEND_EMAILS.map((e) => e.subject),
    ['Apply to Venn with me', 'You should apply to this', 'Thought of you for this']);
  for (const e of FRIEND_EMAILS) {
    for (const k of ['{friend}', '{link}', '{name}']) assert.ok(e.body.includes(k), k);
  }
  assert.ok(FRIEND_EMAILS[1].body.includes('{blank}'));
});

test('variantIndex is stable, in range, case/space-insensitive', () => {
  assert.equal(variantIndex('Abc123', 5), variantIndex('  abc123 ', 5));
  assert.equal(variantIndex('abc123', 5), variantIndex('abc123', 5));
  assert.equal(variantIndex('', 5), variantIndex('', 5));
  const seen = new Set<number>();
  for (let i = 0; i < 200; i++) {
    const v = variantIndex('code' + i, 5);
    assert.ok(Number.isInteger(v) && v >= 0 && v < 5);
    seen.add(v);
  }
  assert.equal(seen.size, 5);
  // pinned FNV-1a 32-bit: "a" = 0xe40c292c
  assert.equal(variantIndex('a', 1000003), 0xe40c292c % 1000003);
});

test('nextVariant wraps', () => {
  assert.equal(nextVariant(0, 5), 1);
  assert.equal(nextVariant(4, 5), 0);
  assert.equal(nextVariant(2, 3), 0);
});

test('fill replaces all, leaves unknown', () => {
  assert.equal(fill('{a} and {a} and {b}', { a: 'x' }), 'x and x and {b}');
  assert.equal(fill('hi {name}', { name: '$&' }), 'hi $&');
  assert.equal(fill('{toString}', {}), '{toString}');
});

test('isLinkedInPostUrl', () => {
  const ok = [
    'https://www.linkedin.com/posts/jane-doe_abc-123',
    'http://linkedin.com/posts/x',
    'linkedin.com/feed/update/urn:li:activity:123',
    'WWW.LinkedIn.com/Posts/x',
    'https://linkedin.com/feed/update/urn:li:share:1/?utm=a',
    'https://lnkd.in/gAbC12xY', 'lnkd.in/gAbC12xY', 'LNKD.IN/abc', 'http://www.lnkd.in/abc?x=1#y',
    'https://www.linkedin.com/pulse/some-article-jane', 'https://linkedin.com/embed/feed/update/urn:li:share:1',
    'https://m.linkedin.com/posts/x', 'https://uk.linkedin.com/posts/x', 'https://linkedin.com/mwlite/feed/update/urn:li:activity:1',
    'https://www.linkedin.com/feed/update/urn:li:activity:123?utm_source=share&utm_medium=member_ios',
  ];
  const bad = [
    '', 'https://lnkd.in/', 'https://lnkd.in/a b', 'https://evil.com/lnkd.in/x', 'https://lnkd.in.evil.com/x',
    'https://linkedin.com/in/jane', 'https://linkedin.com/feed/', 'https://linkedin.com/feed', 'https://abc.linkedin.com/posts/x',
    'https://evil.com/m.linkedin.com/posts/x', 'https://www.linkedin.com/in/jane',
    'https://linkedin.com/posts/', 'https://linkedin.com/feed/update/',
    'https://linkedin.com/posts/a b', ' https://linkedin.com/posts/x',
    'https://linkedin.com/posts/x\n', 'https://evil.com/linkedin.com/posts/x',
    'https://notlinkedin.com/posts/x', 'https://linkedin.com/feed/', 'ftp://linkedin.com/posts/x',
  ];
  for (const s of ok) assert.equal(isLinkedInPostUrl(s), true, s);
  for (const s of bad) assert.equal(isLinkedInPostUrl(s), false, JSON.stringify(s));
});

test('normalizePostUrl', () => {
  assert.equal(normalizePostUrl('  linkedin.com/posts/x '), 'https://linkedin.com/posts/x');
  assert.equal(normalizePostUrl('http://linkedin.com/posts/x'), 'http://linkedin.com/posts/x');
  assert.equal(normalizePostUrl('HTTPS://linkedin.com/posts/x'), 'HTTPS://linkedin.com/posts/x');
  assert.equal(normalizePostUrl(''), '');
});

test('timeLeft', () => {
  const now = 1_000_000_000_000;
  const due = (ms: number) => new Date(now + ms).toISOString();
  const H = 3600_000, M = 60_000;
  assert.deepEqual(timeLeft(due(23 * H + 41 * M + 5000), now), { ms: 23 * H + 41 * M + 5000, text: '23h 41m left', over: false });
  assert.equal(timeLeft(due(41 * M + 30_000), now).text, '41m left');
  assert.equal(timeLeft(due(H), now).text, '1h 0m left');
  assert.equal(timeLeft(due(59_000), now).text, 'Under a minute left');
  const o = timeLeft(due(0), now);
  assert.equal(o.over, true);
  assert.equal(timeLeft(due(-5 * H), now).over, true);
  assert.equal(timeLeft(due(-5 * H), now).ms, -5 * H);
  const bad = timeLeft('nope', now);
  assert.equal(bad.over, false);
});
