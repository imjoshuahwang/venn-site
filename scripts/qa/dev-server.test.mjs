import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { readFileSync } from 'node:fs';
import { freePort, supabaseStatus } from './dev-server.mjs';

test('freePort never returns a port something else already holds', async () => {
  const held = net.createServer();
  await new Promise((r) => held.listen(0, '127.0.0.1', r));
  const taken = held.address().port;
  try {
    for (let i = 0; i < 5; i++) assert.notEqual(await freePort(), taken);
  } finally { held.close(); }
});

test('qa:portal starts its own server on a free port instead of reusing 4333', () => {
  const src = readFileSync(new URL('./portal.mjs', import.meta.url), 'utf8');
  assert.match(src, /port \?\?= await freePort\(\)/);
  assert.doesNotMatch(src, /port = 4333|, 4334\)/);
});

test('supabaseStatus says the stack is down in one clear line', () => {
  const down = () => { throw new Error('exit 1'); };
  assert.throws(() => supabaseStatus(down), /local Supabase is not running.*supabase start/);
});

test('supabaseStatus refuses a non-local stack and returns a local one', () => {
  assert.throws(() => supabaseStatus(() => Buffer.from('{"API_URL":"https://x.supabase.co"}')), /non-local/);
  assert.equal(supabaseStatus(() => Buffer.from('noise\n{"API_URL":"http://127.0.0.1:54321"}')).API_URL, 'http://127.0.0.1:54321');
});
