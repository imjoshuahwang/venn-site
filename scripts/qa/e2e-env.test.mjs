import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { localServerEnv, TURNSTILE_LOCAL } from './portal.mjs';

test('localServerEnv forces test Turnstile keys over real ones in the shell', () => {
  const env = localServerEnv('http://127.0.0.1:54321', 'anon', { PORTAL_HOST: 'x' }, { PUBLIC_TURNSTILE_SITE_KEY: '0x4AAAAreal', TURNSTILE_SECRET_KEY: '0x4AAAAreal', KEEP: '1' });
  assert.equal(env.PUBLIC_TURNSTILE_SITE_KEY, TURNSTILE_LOCAL.PUBLIC_TURNSTILE_SITE_KEY);
  assert.equal(env.TURNSTILE_SECRET_KEY, TURNSTILE_LOCAL.TURNSTILE_SECRET_KEY);
  assert.equal(env.PUBLIC_SUPABASE_URL, 'http://127.0.0.1:54321');
  assert.equal(env.PORTAL_HOST, 'x');
  assert.equal(env.KEEP, '1');
});

test('every e2e spec that spawns a server uses localServerEnv', () => {
  const dir = new URL('../../e2e/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.spec.mjs'))) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    if (!/\bspawn\(/.test(src)) continue;
    assert.match(src, /env: localServerEnv\(/, `${f} spawns a server without localServerEnv`);
    assert.doesNotMatch(src, /\.\.\.process\.env/, `${f} spreads process.env into a server env`);
  }
});
