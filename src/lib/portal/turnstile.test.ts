import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyTurnstile, TURNSTILE_TEST } from './turnstile.ts';

// Mock of Cloudflare siteverify keyed on the documented test secrets. Never touches the network.
const cf = (async (_url: string, init: { body: URLSearchParams }) => {
  const secret = init.body.get('secret');
  const ok = secret === TURNSTILE_TEST.secretPass && !!init.body.get('response');
  return { ok: true, json: async () => ({ success: ok }) };
}) as never;

test('test keys are the documented Cloudflare values', () => {
  assert.equal(TURNSTILE_TEST.secretPass, '1x0000000000000000000000000000000AA');
  assert.equal(TURNSTILE_TEST.secretFail, '2x0000000000000000000000000000000AA');
  assert.equal(TURNSTILE_TEST.siteKey, '1x00000000000000000000AA');
});
test('pass secret verifies, fail secret does not', async () => {
  assert.equal(await verifyTurnstile('tok', TURNSTILE_TEST.secretPass, '1.2.3.4', cf), true);
  assert.equal(await verifyTurnstile('tok', TURNSTILE_TEST.secretFail, '1.2.3.4', cf), false);
});
test('missing token fails without calling Cloudflare', async () => {
  let called = false;
  const spy = (async () => { called = true; return { ok: true, json: async () => ({ success: true }) }; }) as never;
  assert.equal(await verifyTurnstile('', TURNSTILE_TEST.secretPass, '1.2.3.4', spy), false);
  assert.equal(called, false);
});
test('network failure or bad response fails closed', async () => {
  assert.equal(await verifyTurnstile('t', 's', '1.1.1.1', (async () => { throw new Error('down'); }) as never), false);
  assert.equal(await verifyTurnstile('t', 's', '1.1.1.1', (async () => ({ ok: false, json: async () => ({}) })) as never), false);
});
