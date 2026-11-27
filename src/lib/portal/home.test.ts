import test from 'node:test';
import assert from 'node:assert/strict';
import { loadHome } from './home.ts';

test('home reads run together, not one after the other', async () => {
  const started: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const p = loadHome({
    ceremony: async () => { started.push('ceremony'); await gate; return { status: 'none' } as never; },
    consent: async () => { started.push('consent'); await gate; return { data: { application: null, done: true }, error: null } as never; },
  });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(started.sort(), ['ceremony', 'consent']);
  release();
  const h = await p;
  assert.equal(h.ceremony.status, 'none');
  assert.equal(h.consentFailed, false);
});

test('a throwing consent read is a failure, never a skipped redirect', async () => {
  const h = await loadHome({ ceremony: async () => ({ status: 'none' }) as never, consent: async () => { throw new Error('x'); } });
  assert.equal(h.consentFailed, true);
});

test('consent not done sends to the ceremony', async () => {
  const h = await loadHome({ ceremony: async () => ({ status: 'none' }) as never, consent: async () => ({ data: { application: 1, done: false }, error: null }) as never });
  assert.equal(h.consentFailed, false);
  assert.equal(h.redirectToConsent, true);
});

test('no result and no application is the none state, not the error page', async () => {
  const h = await loadHome({ ceremony: async () => ({ status: 'none' }) as never, consent: async () => ({ data: { application: null, done: true }, error: null }) as never });
  assert.equal(h.consentFailed, false);
  assert.equal(h.redirectToConsent, false);
  assert.equal(h.ceremony.status, 'none');
});

test('a rejected ceremony read becomes an error state, not a throw', async () => {
  const h = await loadHome({ ceremony: async () => { throw new Error('boom'); }, consent: async () => ({ data: { application: null, done: true }, error: null }) as never });
  assert.equal(h.ceremony.status, 'error');
});
