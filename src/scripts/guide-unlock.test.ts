import test from 'node:test';
import assert from 'node:assert/strict';
import { emailOk, thingOk, pctFor, unlockGuide, guideEvent } from './guide-unlock.ts';

const cfg = { url: 'https://x.supabase.co', key: 'anon' };
const A = { slug: 's', email: 'me@school.edu', thing: 'club', ref: '' };

test('progress: 30 on load, 70 after thing, 100 once unlocked', () => {
  assert.deepEqual([pctFor('thing'), pctFor('email'), pctFor('done')], [30, 70, 100]);
});

test('thing: 1-200 chars after trim', () => {
  assert.equal(thingOk('  '), false);
  assert.equal(thingOk('a robotics club'), true);
  assert.equal(thingOk('x'.repeat(201)), false);
});

test('email: shape check, no dotless domains', () => {
  assert.equal(emailOk('me@school.edu'), true);
  assert.equal(emailOk('me@gmail'), false);
  assert.equal(emailOk('nope'), false);
  assert.equal(emailOk('a b@c.com'), false);
});

test('unlockGuide posts the RPC body and returns html', async () => {
  let call: any;
  const f = async (u: string, init: any) => { call = { u, init }; return new Response(JSON.stringify('<h2>3</h2>'), { status: 200 }); };
  const r = await unlockGuide(f as any, cfg, { slug: 's', email: ' Me@School.edu ', thing: ' club ', ref: 'abc' });
  assert.deepEqual(r, { ok: true, html: '<h2>3</h2>' });
  assert.equal(call.u, 'https://x.supabase.co/rest/v1/rpc/unlock_guide');
  assert.equal(call.init.headers.apikey, 'anon');
  assert.equal(call.init.headers.Authorization, 'Bearer anon');
  assert.deepEqual(JSON.parse(call.init.body), { p_slug: 's', p_email: 'me@school.edu', p_thing: 'club', p_ref: 'abc' });
});

test('unlockGuide fails closed on http error, network error, non-string body', async () => {
  assert.equal((await unlockGuide((async () => new Response('{}', { status: 400 })) as any, cfg, A)).ok, false);
  assert.equal((await unlockGuide((async () => { throw new Error('net'); }) as any, cfg, A)).ok, false);
  assert.equal((await unlockGuide((async () => new Response('{"a":1}', { status: 200 })) as any, cfg, A)).ok, false);
  assert.equal((await unlockGuide((async () => new Response('""', { status: 200 })) as any, cfg, A)).ok, false);
});

test('unlockGuide refuses bad input without calling the network', async () => {
  let n = 0;
  const f = (async () => { n++; return new Response('"x"'); }) as any;
  assert.equal((await unlockGuide(f, cfg, { ...A, email: 'bad' })).ok, false);
  assert.equal((await unlockGuide(f, cfg, { ...A, thing: '' })).ok, false);
  assert.equal(n, 0);
});

test('guideEvent posts and never throws', async () => {
  let body: any;
  await guideEvent((async (_u: string, i: any) => { body = JSON.parse(i.body); return new Response(null); }) as any, cfg, 'form_start', 's', 'r');
  assert.deepEqual(body, { p_event: 'form_start', p_slug: 's', p_ref: 'r' });
  await guideEvent((async () => { throw new Error('x'); }) as any, cfg, 'guide_view', 's', '');
  await guideEvent((async () => new Response(null)) as any, { url: '', key: '' }, 'guide_view', 's', '');
});
