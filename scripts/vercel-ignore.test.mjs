import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const run = (files, ref = 'main') =>
  spawnSync('bash', ['scripts/vercel-ignore.sh'], {
    env: { ...process.env, VERCEL_GIT_COMMIT_REF: ref, FILES: files },
  }).status;

test('skips non-main branches', () => assert.equal(run('src/a.ts', 'feature'), 0));
test('skips docs/test-only changes', () =>
  assert.equal(run('docs/a.txt\ne2e/x.ts\nqa/y\nsupabase/m.sql\nREADME.md\nsrc/a.test.ts'), 0));
test('builds when site files change', () => assert.equal(run('docs/a.md\nsrc/pages/index.astro'), 1));
test('builds on empty file list (fail safe)', () => assert.equal(run(''), 1));
