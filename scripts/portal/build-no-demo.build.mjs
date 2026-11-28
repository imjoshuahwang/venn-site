// G4 (#318): a real `astro build` contains no /demo route and no demo fixtures. Run via `npm run test:g4`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, lstatSync } from 'node:fs';
import { join } from 'node:path';

const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return lstatSync(p).isDirectory() ? walk(p) : [p]; });

test('production build has no demo route or fixtures', () => {
  execFileSync('npx', ['astro', 'build'], { stdio: 'ignore', env: { ...process.env, PUBLIC_SUPABASE_URL: 'https://x.invalid', PUBLIC_SUPABASE_ANON_KEY: 'x' } });
  const files = walk('.vercel/output');
  assert.deepEqual(files.filter((f) => /demo/i.test(f)), []);
  const hits = files.filter((f) => /\.(m?js|html|json|func)$/.test(f) && /venn_demo|demoClientFor|maya\.demo@example\.com|src\/demo\/demo/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(hits, []);
});
