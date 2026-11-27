import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../../pages/portal/api/event.ts';
import { portalEvent } from './api.ts';

function run(o: { user?: boolean; origin?: string | null; body?: string }) {
  const calls: any[] = [];
  const supabase = { rpc: async (fn: string, args: unknown) => (calls.push({ fn, args }), { data: null, error: null }) };
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (o.origin !== null) headers.origin = o.origin ?? 'https://x.test';
  const request = new Request('https://x.test/portal/api/event', { method: 'POST', headers, body: o.body ?? '{"step":"next_steps_opened"}' });
  return POST({ request, locals: { user: o.user === false ? null : { id: 'u' }, supabase } } as any).then((r: Response) => ({ status: r.status, calls }));
}

test('event: no session 401, unknown step 400, cross-site 403, ok calls the RPC once', async () => {
  assert.equal((await run({ user: false })).status, 401);
  const bad = await run({ body: '{"step":"nope"}' });
  assert.equal(bad.status, 400); assert.equal(bad.calls.length, 0);
  const cross = await run({ origin: 'https://evil.test' });
  assert.equal(cross.status, 403); assert.equal(cross.calls.length, 0);
  assert.equal((await run({ origin: null })).status, 403);
  const ok = await run({});
  assert.equal(ok.status, 204); assert.deepEqual(ok.calls, [{ fn: 'portal_event', args: { p_step: 'next_steps_opened' } }]);
});

test('portalEvent never throws', async () => {
  await portalEvent({ rpc: async () => { throw new Error('down'); } } as any, 'link_opened');
  await portalEvent({ rpc: async () => ({ data: null, error: { message: 'x' } }) } as any, 'link_opened');
});
