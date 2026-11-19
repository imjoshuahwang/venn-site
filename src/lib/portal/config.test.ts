import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const toml = readFileSync(new URL('../../../supabase/config.toml', import.meta.url), 'utf8');
const block = (name: string) => {
  const start = toml.indexOf(`[${name}]\n`);
  if (start < 0) return '';
  const rest = toml.slice(start + name.length + 3);
  const end = rest.search(/^\[/m);
  return end < 0 ? rest : rest.slice(0, end);
};

test('email links last 72 hours', () => {
  assert.match(block('auth.email'), /^otp_expiry\s*=\s*259200\s*$/m);
});
test('sessions last 30 days', () => {
  assert.match(block('auth.sessions'), /^timebox\s*=\s*"720h"\s*$/m);
});
test('CSP lets Cloudflare Turnstile load', () => {
  const v = readFileSync(new URL('../../../vercel.json', import.meta.url), 'utf8');
  assert.match(v, /script-src[^;]*challenges\.cloudflare\.com/);
  assert.match(v, /frame-src[^;]*challenges\.cloudflare\.com/);
});
