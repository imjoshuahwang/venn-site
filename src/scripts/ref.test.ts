import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getRef, captureRef, clearRef } from './ref.ts';

const store = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k) };
};
const boom = () => { throw new Error('blocked'); };
const throwing = { getItem: boom, setItem: boom, removeItem: boom };
const g = globalThis as any;
const realNow = Date.now;
let ls: ReturnType<typeof store>, ss: ReturnType<typeof store>;
const page = (search: string) => { g.location = { search }; };

beforeEach(() => {
  ls = store(); ss = store();
  g.localStorage = ls; g.sessionStorage = ss;
  Date.now = realNow;
  page('');
});

test('first ref wins over a later different ?ref=', () => {
  page('?ref=maya'); assert.equal(getRef(), 'maya');
  page('?ref=other'); assert.equal(getRef(), 'maya');
});

test('expired ref (>30 days) is replaced', () => {
  const t = realNow();
  Date.now = () => t; page('?ref=old'); getRef();
  Date.now = () => t + 31 * 86400000; page('?ref=new');
  assert.equal(getRef(), 'new');
});

test('malformed JSON is removed', () => {
  ls.m.set('venn_ref', '{nope');
  assert.equal(getRef(), '');
  assert.equal(ls.m.has('venn_ref'), false);
});

test('uppercase and spaces are cleaned', () => {
  page('?ref=%20MaYa%20Lee!'); assert.equal(getRef(), 'mayalee');
});

test('throwing localStorage does not throw; URL and session still work', () => {
  g.localStorage = throwing;
  page('?ref=abc'); assert.equal(getRef(), 'abc');
  page(''); assert.equal(getRef(), 'abc'); // sessionStorage fallback
  g.sessionStorage = throwing;
  assert.doesNotThrow(() => { captureRef(); clearRef(); getRef(); });
});

test('captured on page A is returned on page B', () => {
  page('?ref=zed'); captureRef();
  page(''); assert.equal(getRef(), 'zed');
});

test('clearRef empties it', () => {
  page('?ref=zed'); captureRef(); clearRef();
  page(''); assert.equal(getRef(), '');
  assert.equal(ls.m.size + ss.m.size, 0);
});
