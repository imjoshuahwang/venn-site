import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Cloudflare's always-pass test keys must never ship; a production build with no key configured has to fail closed instead.
function walk(dir, out = []) {
  // Skip symlinks: the Vercel adapter links node_modules into the function dir, and that link can dangle in a worktree.
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}

test('production build contains no Turnstile test keys', { timeout: 300000 }, () => {
  const env = { ...process.env, NODE_ENV: 'production' };
  delete env.PUBLIC_TURNSTILE_SITE_KEY;
  delete env.TURNSTILE_SECRET_KEY;
  execSync('npm run build', { stdio: 'pipe', env });
  const roots = ['.vercel/output', 'dist'].filter(existsSync);
  assert.ok(roots.length > 0, 'build produced no output dir');
  const hits = roots.flatMap((r) => walk(r)).filter((f) => /1x0000/.test(readFileSync(f).toString('latin1')));
  assert.deepEqual(hits, []);
});
