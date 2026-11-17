import { test } from 'node:test';
import assert from 'node:assert/strict';
import { portalRewrite, isPublicPortalPath } from '../../src/lib/portal/host.ts';

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
  for (const p of ['/portal/login', '/portal/set-password', '/portal/reset', '/portal/auth/callback', '/portal/logout']) {
    assert.ok(isPublicPortalPath(p), p);
  }
  assert.ok(!isPublicPortalPath('/portal'));
  assert.ok(!isPublicPortalPath('/portal/loginx'));
});
