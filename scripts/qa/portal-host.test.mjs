import { test } from 'node:test';
import assert from 'node:assert/strict';
import { portalRewrite, isPublicPortalPath, safeNext } from '../../src/lib/portal/host.ts';

test('portal host root maps to /portal', () => {
  assert.equal(portalRewrite('portal.joinvenn.org', '/'), '/portal');
});
test('portal host deep path maps under /portal', () => {
  assert.equal(portalRewrite('portal.joinvenn.org', '/login'), '/portal/login');
  assert.equal(portalRewrite('portal.joinvenn.org:443', '/a/b'), '/portal/a/b');
});
test('portal host does not double-prefix', () => {
  assert.equal(portalRewrite('portal.joinvenn.org', '/portal/login'), '/portal/login');
});
test('preview and localhost serve /portal/* as-is', () => {
  assert.equal(portalRewrite('venn-site-git-x.vercel.app', '/portal/login'), '/portal/login');
  assert.equal(portalRewrite('localhost:8000', '/portal'), '/portal');
});
test('marketing host non-portal path -> null', () => {
  assert.equal(portalRewrite('joinvenn.org', '/apply'), null);
  assert.equal(portalRewrite('localhost:8000', '/'), null);
  assert.equal(portalRewrite('joinvenn.org', '/portalx'), null);
});
test('PORTAL_HOST override', () => {
  assert.equal(portalRewrite('p.example.test', '/x', 'p.example.test'), '/portal/x');
  assert.equal(portalRewrite('portal.joinvenn.org', '/x', 'p.example.test'), null);
});
test('public portal paths', () => {
  for (const p of ['/portal/login', '/portal/set-password', '/portal/reset', '/portal/auth/callback', '/portal/logout', '/portal/dev/result', '/portal/dev/peer-down']) {
    assert.ok(isPublicPortalPath(p), p);
  }
  assert.ok(!isPublicPortalPath('/portal'));
  assert.ok(!isPublicPortalPath('/portal/loginx'));
});
test('safeNext blocks open redirects', () => {
  assert.equal(safeNext('/portal/x?a=1'), '/portal/x?a=1');
  assert.equal(safeNext('//evil.com'), null);
  assert.equal(safeNext('/\\evil.com'), null);
  assert.equal(safeNext('https://evil.com'), null);
});

import { readFileSync } from 'node:fs';

const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
const portalRule = (r) => r.source === '/' && (r.has ?? []).some((h) => h.type === 'host' && h.value === 'portal.joinvenn.org');

test('vercel.json redirects portal host root to /portal, host-scoped and non-permanent', () => {
  const rules = vercel.redirects.filter(portalRule);
  assert.equal(rules.length, 1);
  assert.deepEqual(rules[0], { source: '/', has: [{ type: 'host', value: 'portal.joinvenn.org' }], destination: '/portal', permanent: false });
});
test('redirects and rewrites match the expected list', () => {
  assert.deepStrictEqual(vercel.redirects, [
    { source: '/boost', destination: '/refer', permanent: true },
    { source: '/pricing', destination: '/startups', permanent: true },
    { source: '/', has: [{ type: 'host', value: 'portal.joinvenn.org' }], destination: '/portal', permanent: false },
  ]);
  assert.deepStrictEqual(vercel.rewrites, [
    { source: '/u', destination: 'https://wirjadichvbmrqzamwtp.supabase.co/functions/v1/unsubscribe' },
  ]);
});
test('header rules keep their sources and header names', () => {
  assert.deepStrictEqual(vercel.headers.map((h) => h.source), ['/(.*)', '/(.*)\\.md', '/(llms|llms-full)\\.txt']);
  assert.deepStrictEqual(vercel.headers[0].headers.map((h) => h.key), [
    'Content-Security-Policy', 'Referrer-Policy', 'X-Frame-Options', 'X-Content-Type-Options', 'Permissions-Policy',
  ]);
});
test('portal layout drops pill transition under reduced motion', () => {
  const css = readFileSync(new URL('../../src/layouts/Portal.astro', import.meta.url), 'utf8');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.pill\s*\{\s*transition:\s*none/);
});
