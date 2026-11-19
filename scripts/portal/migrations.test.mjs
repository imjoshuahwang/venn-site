import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url));

test('every migration has a unique version prefix', () => {
  const seen = new Map();
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql'))) {
    const v = f.split('_')[0];
    assert.match(v, /^\d{14}$/, `${f}: version must be 14 digits`);
    assert.ok(!seen.has(v), `duplicate migration version ${v}: ${seen.get(v)} and ${f}`);
    seen.set(v, f);
  }
});
