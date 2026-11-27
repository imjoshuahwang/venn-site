import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const toml = readFileSync(new URL('../../../supabase/config.toml', import.meta.url), 'utf8');
const section = (name: string) => new RegExp(`^\\[${name.replace('.', '\\.')}\\]\\n((?:(?!\\[).*\\n?)*)`, 'm').exec(toml)?.[1] ?? '';

test('config.toml pins signup off and email confirmations on', () => {
  assert.match(section('auth'), /^enable_signup\s*=\s*false\s*$/m);
  assert.match(section('auth.email'), /^enable_confirmations\s*=\s*true\s*$/m);
});

test('nothing in src or scripts calls auth.signUp', () => {
  const walk = (d: URL): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? (e.name === 'node_modules' ? [] : walk(new URL(`${e.name}/`, d))) : [new URL(e.name, d).pathname]);
  for (const root of ['../../', '../../../scripts/']) {
    for (const f of walk(new URL(root, import.meta.url))) {
      if (!/\.(ts|astro|mjs|js)$/.test(f) || f.endsWith('config.test.ts')) continue;
      assert.doesNotMatch(readFileSync(f, 'utf8'), /\.signUp\(/, f);
    }
  }
});
