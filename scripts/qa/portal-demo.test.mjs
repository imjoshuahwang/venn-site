import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { demoAllowed } from '../../src/lib/demo-gate.ts';

test('demo pages are on in local dev and on Vercel previews', () => {
  assert.ok(demoAllowed({ dev: true }));
  assert.ok(demoAllowed({ dev: true, vercelEnv: 'production' }));
  assert.ok(demoAllowed({ dev: false, vercelEnv: 'preview' }));
});
test('demo pages are off in production and whenever VERCEL_ENV is unknown', () => {
  assert.ok(!demoAllowed({ dev: false, vercelEnv: 'production' }));
  assert.ok(!demoAllowed({ dev: false, vercelEnv: undefined }));
  assert.ok(!demoAllowed({ dev: false, vercelEnv: 'development' }));
  assert.ok(!demoAllowed({ dev: false, vercelEnv: 'Preview' }));
  assert.ok(!demoAllowed({}));
});

const page = readFileSync(new URL('../../src/pages/portal/demo.astro', import.meta.url), 'utf8');
const front = page.split('---')[1];
test('demo page checks the gate before anything else and answers 404', () => {
  const gate = front.indexOf('if (!demoAllowed({ dev: import.meta.env.DEV, vercelEnv: process.env.VERCEL_ENV }))');
  assert.ok(gate > 0, 'gate call missing');
  assert.match(front.slice(gate, gate + 200), /status: 404/);
  assert.ok(!/\bsupabase\b|\.rpc\(|locals\.supabase/.test(front), 'demo page must not touch Supabase');
});
test('demo page forms never post', () => {
  assert.ok(!/method:\s*'post'/.test(front));
  assert.ok(!/method="post"/i.test(page));
});
