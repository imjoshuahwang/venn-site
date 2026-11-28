import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPublicPortalPath, safeNext } from '../../src/lib/portal/host.ts';

test('public portal paths', () => {
  for (const p of ['/portal/login', '/portal/set-password', '/portal/reset', '/portal/auth/callback', '/portal/logout', '/portal/dev/result', '/portal/dev/peer-down', '/portal/dev/mou', '/portal/dev/guiding']) {
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
test('redirects and rewrites match the expected list', () => {
  assert.deepStrictEqual(vercel.redirects, [
    { source: '/boost', destination: '/refer', permanent: true },
    { source: '/pricing', destination: '/startups', permanent: true },
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
  const css = readFileSync(new URL('../../src/styles/base.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\.pill\s*\{\s*transition:\s*none/);
});

test('supabase site_url is the bare origin (templates append /portal/auth/callback) and the callback is allowlisted', () => {
  const toml = readFileSync(new URL('../../supabase/config.toml', import.meta.url), 'utf8');
  assert.match(toml, /^site_url = "https:\/\/joinvenn\.org"$/m);
  assert.match(toml, /additional_redirect_urls = \[[^\]]*"https:\/\/joinvenn\.org\/portal\/auth\/callback"/);
});

import { readdirSync } from 'node:fs';

test('portal runs on demand and POST bodies survive (#169)', () => {
  // The adapter's edge middleware re-fetches the render function without method or body, which turned every POST into a GET.
  assert.ok(!/edgeMiddleware/.test(readFileSync(new URL('../../astro.config.mjs', import.meta.url), 'utf8')));
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(new URL(`${e.name}/`, d)) : [new URL(e.name, d)]));
  for (const f of walk(new URL('../../src/pages/portal/', import.meta.url))) {
    assert.match(readFileSync(f, 'utf8'), /export const prerender = false/, f.pathname);
  }
});
