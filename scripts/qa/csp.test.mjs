import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cfg = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
const csp = cfg.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy').value;
const dir = (name) => csp.split(';').map((s) => s.trim().split(/\s+/)).find(([n]) => n === name)?.slice(1) ?? [];

test('CSP allows the Cloudflare Web Analytics beacon, nothing wider', () => {
  assert.ok(dir('script-src').includes('https://static.cloudflareinsights.com'));
  assert.ok(dir('connect-src').includes('https://cloudflareinsights.com'));
  for (const d of ['script-src', 'connect-src']) {
    assert.ok(!dir(d).some((s) => s.includes('*')), `${d} has a wildcard`);
  }
  assert.ok(!dir('script-src').includes("'unsafe-eval'"));
});
