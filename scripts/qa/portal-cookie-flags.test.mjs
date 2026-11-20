import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// @supabase/ssr hands setAll options with httpOnly: false. Our flags must come after the spread so they win.
test('session cookies are set HttpOnly, Secure and SameSite=Lax after the library options', () => {
  const src = readFileSync(new URL('../../src/lib/portal/supabase.ts', import.meta.url), 'utf8');
  const call = src.match(/Astro\.cookies\.set\(name, value, \{([^}]*)\}\)/);
  assert.ok(call, 'cookies.set call not found');
  const parts = call[1].split(',').map((x) => x.trim()).filter(Boolean);
  const spread = parts.indexOf('...options');
  assert.ok(spread >= 0, 'options spread missing');
  for (const flag of ['httpOnly: true', 'secure', "sameSite: 'lax'"]) {
    const i = parts.indexOf(flag);
    assert.ok(i > spread, `${flag} must come after ...options`);
  }
});
