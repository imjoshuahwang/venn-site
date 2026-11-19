// Ceremony logic: pure, no DOM. Beats follow the #112 Beauty bar; all reveal durations live here (ms).
const BEATS = {
  big: [['lift', 0, 400], ['bloom', 400, 1600], ['seal', 1600, 2200], ['type', 2200, 4400], ['confetti', 4400, 5000]],
  small: [['lift', 0, 300], ['warm', 300, 800], ['fade', 800, 1500]],
  reduced: [['crossfade', 0, 200]],
};

export const revealKind = (outcome, reduced) => (reduced ? 'reduced' : outcome === 'cohort' || outcome === 'peer' ? 'big' : 'small');
export const timeline = (kind) => BEATS[kind].map(([name, start, end]) => ({ name, start, end }));
// Card lift: scale 1 -> 1.04 over the lift beat. Big reveals hold it until the seal beat ends, then settle.
export const LIFT_SCALE = 1.04;
export function cardFrames(kind) {
  const beats = Object.fromEntries(timeline(kind).map((b) => [b.name, b]));
  const lift = beats.lift, seal = beats.seal;
  const total = (seal ?? beats.warm).end;
  const at = (ms) => ms / total;
  const up = { offset: at(lift.end), transform: `scale(${LIFT_SCALE})`, boxShadow: 'var(--shadow-2)' };
  const frames = [{ offset: 0, transform: 'scale(1)', boxShadow: 'var(--shadow-1)' }, up];
  if (seal) frames.push({ ...up, offset: at(seal.start) });
  frames.push({ offset: 1, transform: 'scale(1)', boxShadow: 'var(--shadow-1)' });
  return { frames, duration: total };
}

export const totalMs = (kind) => BEATS[kind].at(-1)[2];

// Slots for flows that are not on main yet (#127 consent, #128 parent, #132 Text Josh). Each is skippable.
export function setupSteps(done) {
  const slot = (id) => ({ id, skippable: true });
  return {
    before: ['consent', 'parent'].filter((id) => !done[id]).map(slot),
    after: done.phone ? [] : [slot('phone')],
  };
}

export const initialScreen = (result) => (!result ? 'nothing' : result.doneAt ? 'home' : 'ceremony');

export function splitLetter(text) {
  const parts = String(text ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return { headline: parts[0] ?? '', body: parts.slice(1) };
}

export function sharePayload() {
  return { title: 'Venn', text: "I applied to Venn for Fall '26.", url: 'https://joinvenn.org' };
}

export async function share(nav, payload) {
  try {
    if (nav?.share) { await nav.share(payload); return 'shared'; }
  } catch (e) {
    if (e?.name === 'AbortError') return 'cancelled';
  }
  try {
    if (nav?.clipboard?.writeText) { await nav.clipboard.writeText(payload.url); return 'copied'; }
  } catch { /* fall through */ }
  return 'failed';
}

export function createCeremony({ result, setup, reduced, api }) {
  const steps = setupSteps(setup);
  const state = {
    screen: steps.before.length ? `setup:${steps.before[0].id}` : 'sealed',
    kind: revealKind(result.outcome, reduced),
    viewedError: false,
    finishPending: false,
  };
  let before = steps.before.slice(1);
  let after = [...steps.after];
  let viewing = null;
  let finishing = null;

  const afterSetupStart = () => { state.screen = after.length ? `setup:${after.shift().id}` : 'finishing'; };

  return {
    state,
    next() {
      if (state.screen.startsWith('setup:') && !state.revealedOnce) { state.screen = before.length ? `setup:${before.shift().id}` : 'sealed'; return; }
      if (state.screen === 'revealing' || state.screen === 'letter' || state.screen.startsWith('setup:')) afterSetupStart();
    },
    reveal() {
      if (state.screen !== 'sealed') return viewing ?? Promise.resolve();
      state.screen = 'revealing';
      state.revealedOnce = true;
      if (!viewing) {
        viewing = result.viewedAt ? Promise.resolve() : Promise.resolve().then(() => api.markViewed(result.id)).catch(() => { state.viewedError = true; });
      }
      return viewing;
    },
    revealed() { if (state.screen === 'revealing') state.screen = 'letter'; },
    finish() {
      if (state.screen === 'home') return Promise.resolve();
      finishing ??= Promise.resolve().then(() => api.finishCeremony(result.id))
        .catch(() => { state.finishPending = true; })
        .then(() => { state.screen = 'home'; });
      return finishing;
    },
    async retryFinish() {
      if (!state.finishPending) return true;
      try { await api.finishCeremony(result.id); state.finishPending = false; return true; } catch { return false; }
    },
  };
}
