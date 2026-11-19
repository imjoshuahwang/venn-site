import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  revealKind, timeline, totalMs, setupSteps, initialScreen, createCeremony, sharePayload, share, splitLetter,
} from '../../src/lib/portal/ceremony.mjs';

const beats = (k) => timeline(k).map((b) => [b.name, b.start, b.end]);

test('Cohort and Peer follow the Beauty bar beats exactly', () => {
  for (const o of ['cohort', 'peer']) assert.equal(revealKind(o, false), 'big');
  assert.deepEqual(beats('big'), [
    ['lift', 0, 400], ['bloom', 400, 1600], ['seal', 1600, 2200], ['type', 2200, 4400], ['confetti', 4400, 5000],
  ]);
  assert.equal(totalMs('big'), 5000);
});

test('waitlists and Not this Season: lift, warm, fade, no confetti, no typing', () => {
  for (const o of ['network_waitlist', 'track_waitlist', 'not_this_season']) assert.equal(revealKind(o, false), 'small');
  assert.deepEqual(beats('small'), [['lift', 0, 300], ['warm', 300, 800], ['fade', 800, 1500]]);
  assert.equal(totalMs('small'), 1500);
  assert.ok(!beats('small').some(([n]) => ['confetti', 'type', 'bloom'].includes(n)));
});

test('reduced motion: only a 200ms crossfade, for every outcome', () => {
  for (const o of ['cohort', 'peer', 'network_waitlist', 'not_this_season']) assert.equal(revealKind(o, true), 'reduced');
  assert.deepEqual(beats('reduced'), [['crossfade', 0, 200]]);
  assert.equal(totalMs('reduced'), 200);
});

test('setup steps: done ones are skipped, text josh is last and only after the letter', () => {
  const all = setupSteps({ consent: false, parent: false, phone: false });
  assert.deepEqual(all.before.map((s) => s.id), ['consent', 'parent']);
  assert.deepEqual(all.after.map((s) => s.id), ['phone']);
  const some = setupSteps({ consent: true, parent: true, phone: false });
  assert.deepEqual(some.before, []);
  assert.deepEqual(some.after.map((s) => s.id), ['phone']);
  const none = setupSteps({ consent: true, parent: true, phone: true });
  assert.deepEqual([none.before, none.after], [[], []]);
});

test('initialScreen: no result -> nothing, done -> home, else ceremony', () => {
  assert.equal(initialScreen(null), 'nothing');
  assert.equal(initialScreen({ doneAt: '2026-11-20T00:00:00Z' }), 'home');
  assert.equal(initialScreen({ doneAt: null }), 'ceremony');
});

const mkApi = (fail = {}) => {
  const calls = [];
  return {
    calls,
    markViewed: async (id) => { calls.push(['mark_viewed', id]); if (fail.mark) throw new Error('x'); },
    finishCeremony: async (id) => { calls.push(['finish_ceremony', id]); if (fail.finish) throw new Error('x'); },
  };
};
const result = { id: 7, outcome: 'cohort', viewedAt: null, doneAt: null };
const doneSetup = { consent: true, parent: true, phone: true };

test('ceremony walks setup -> sealed -> revealing -> letter -> text josh -> home', async () => {
  const api = mkApi();
  const c = createCeremony({ result, setup: { consent: false, parent: true, phone: false }, reduced: false, api });
  assert.equal(c.state.screen, 'setup:consent');
  c.next();
  assert.equal(c.state.screen, 'sealed');
  await c.reveal();
  assert.equal(c.state.screen, 'revealing');
  c.revealed();
  assert.equal(c.state.screen, 'letter');
  c.next();
  assert.equal(c.state.screen, 'setup:phone');
  c.next();
  assert.equal(c.state.screen, 'finishing');
  await c.finish();
  assert.equal(c.state.screen, 'home');
  assert.deepEqual(api.calls, [['mark_viewed', 7], ['finish_ceremony', 7]]);
});

test('reveal tapped twice calls mark_viewed once; already viewed never calls it', async () => {
  const api = mkApi();
  const c = createCeremony({ result, setup: doneSetup, reduced: false, api });
  await Promise.all([c.reveal(), c.reveal()]);
  await c.reveal();
  assert.equal(api.calls.filter(([n]) => n === 'mark_viewed').length, 1);
  const api2 = mkApi();
  const c2 = createCeremony({ result: { ...result, viewedAt: 'x' }, setup: doneSetup, reduced: false, api: api2 });
  await c2.reveal();
  assert.equal(api2.calls.length, 0);
  assert.equal(c2.state.screen, 'revealing');
});

test('mark_viewed failure still reveals', async () => {
  const c = createCeremony({ result, setup: doneSetup, reduced: false, api: mkApi({ mark: true }) });
  await c.reveal();
  assert.equal(c.state.screen, 'revealing');
  assert.equal(c.state.viewedError, true);
});

test('finish failure goes home anyway, flags a retry, never loops back', async () => {
  const api = mkApi({ finish: true });
  const c = createCeremony({ result, setup: doneSetup, reduced: false, api });
  await c.reveal(); c.revealed(); c.next();
  assert.equal(c.state.screen, 'finishing');
  await c.finish();
  assert.equal(c.state.screen, 'home');
  assert.equal(c.state.finishPending, true);
  api.finishCeremony = async (id) => { api.calls.push(['retry', id]); };
  await c.retryFinish();
  assert.equal(c.state.finishPending, false);
  assert.equal(c.state.screen, 'home');
});

test('reduced motion uses the crossfade kind', async () => {
  const c = createCeremony({ result, setup: doneSetup, reduced: true, api: mkApi() });
  await c.reveal();
  assert.equal(c.state.kind, 'reduced');
  assert.equal(c.state.screen, 'revealing');
});

test('share payload carries no private data and falls back to copy', async () => {
  const p = sharePayload();
  const blob = JSON.stringify(p).toLowerCase();
  for (const bad of ['@', 'cohort', 'peer', 'waitlist', 'not this season', 'letter', 'quadron']) assert.ok(!blob.includes(bad), bad);
  assert.match(p.url, /^https:\/\/joinvenn\.org\/?$/);
  assert.equal(await share({ share: async () => {} }, p), 'shared');
  let copied;
  assert.equal(await share({ clipboard: { writeText: async (t) => { copied = t; } } }, p), 'copied');
  assert.equal(copied, p.url);
  assert.equal(await share({ share: async () => { const e = new Error('x'); e.name = 'AbortError'; throw e; } }, p), 'cancelled');
  assert.equal(await share({}, p), 'failed');
});

test('splitLetter: headline first, then body paragraphs', () => {
  assert.deepEqual(splitLetter('Welcome.\n\nOne.\n\nTwo.'), { headline: 'Welcome.', body: ['One.', 'Two.'] });
  assert.deepEqual(splitLetter(''), { headline: '', body: [] });
  assert.deepEqual(splitLetter(null), { headline: '', body: [] });
});

test('retryFinish reports failure for an inline error, and success once it works', async () => {
  const api = mkApi();
  api.finishCeremony = async () => { throw new Error('down'); };
  const c = createCeremony({ result, setup: doneSetup, reduced: false, api });
  await c.reveal(); c.revealed(); c.next();
  await c.finish();
  assert.equal(await c.retryFinish(), false);
  assert.equal(c.state.finishPending, true);
  api.finishCeremony = async () => {};
  assert.equal(await c.retryFinish(), true);
  assert.equal(c.state.finishPending, false);
});

test('next during the reveal finishes it and moves on', async () => {
  const c = createCeremony({ result, setup: doneSetup, reduced: false, api: mkApi() });
  await c.reveal();
  assert.equal(c.state.screen, 'revealing');
  c.next();
  assert.equal(c.state.screen, 'finishing');
});
