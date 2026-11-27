// Match drafter core (#246). Pure functions: pool rules, candidate order, and the per-student loop with injected
// generate() and judge(). No network here; draft.mjs wires the real Claude and Jev callers and the database.
export const THRESHOLD = 4;
export const TRIES = 3;
export const MAX_MESSAGE = 600;
export const SLOT = '[what I want to learn]';
const OPEN = ['draft', 'approved', 'revealed', 'requested'];

export const isMinor = (s) => s.level === 'high_school';

// Peers a student may be offered, best overlap first. Rules mirror matches_guard in the 20261127020000 migration.
export function eligiblePeers(student, peers, { matches = [], blocks = [], taken = new Map() } = {}) {
  const prior = new Set(matches.filter((m) => m.requester_result_id === student.result_id).map((m) => m.peer_result_id));
  const load = (p) => matches.filter((m) => m.peer_result_id === p.result_id && OPEN.includes(m.status)).length + (taken.get(p.result_id) || 0);
  return peers
    .filter((p) => p.result_id !== student.result_id && p.application_id !== student.application_id)
    .filter((p) => p.season === student.season && !p.opted_out_at && !p.paused_at)
    .filter((p) => isMinor(p) === isMinor(student) && !!p.is_test === !!student.is_test)
    .filter((p) => !prior.has(p.result_id))
    .filter((p) => !blocks.some((b) => b.peer_result_id === p.result_id && b.application_id === student.application_id))
    .filter((p) => load(p) < (p.max_open ?? 3))
    .map((p) => ({ p, score: overlap(student, p) }))
    .sort((a, b) => b.score - a.score || a.p.result_id - b.p.result_id)
    .map((x) => x.p);
}

const words = (s) => new Set(String(s || '').toLowerCase().match(/[a-z]{4,}/g) || []);
function overlap(a, b) {
  const wa = words(`${a.working_on} ${a.need}`), wb = words(`${b.working_on} ${b.need}`);
  let n = 0;
  for (const w of wa) if (wb.has(w)) n++;
  return n;
}

export function validDraft(d) {
  if (!d || typeof d !== 'object') return false;
  const { together, common } = d.fit || {};
  const msg = d.draft_message;
  return Array.isArray(together) && together.length >= 1 && together.length <= 2
    && Array.isArray(common) && common.length <= 3
    && [...together, ...common].every((x) => typeof x === 'string' && x.trim())
    && typeof msg === 'string' && msg.length > 0 && msg.length <= MAX_MESSAGE && msg.includes(SLOT);
}

// Only name, org and what they build go to the model; no email, phone or last-name-only fields.
export const profile = (s) => ({ name: s.name, org: s.org, working_on: s.working_on, need: s.need });

export async function draftAll({ requesters, peers, matches = [], blocks = [], generate, judge, limit }) {
  const open = new Set(matches.filter((m) => [...OPEN, 'unmatched'].includes(m.status)).map((m) => m.requester_result_id));
  const taken = new Map();
  const out = [];
  let skipped = 0;
  for (const s of requesters) {
    if (limit != null && out.length >= limit) break;
    if (open.has(s.result_id) || s.opted_out_at || s.paused_at || s.outcome === 'cohort' || s.cohort_id != null) { skipped++; continue; }
    const cands = eligiblePeers(s, peers, { matches, blocks, taken }).slice(0, TRIES);
    let row = null;
    for (const p of cands) {
      let d;
      try { d = await generate(profile(s), profile(p)); } catch { continue; }
      if (!validDraft(d)) continue;
      let j;
      try { j = await judge(profile(s), profile(p), d); } catch { continue; }
      if (!j || !(j.fit >= THRESHOLD && j.specificity >= THRESHOLD)) continue;
      row = { requester_result_id: s.result_id, peer_result_id: p.result_id, status: 'draft', fit: { together: d.fit.together, common: d.fit.common },
        draft_message: d.draft_message, judge_score: (j.fit + j.specificity) / 2 };
      taken.set(p.result_id, (taken.get(p.result_id) || 0) + 1);
      break;
    }
    out.push(row || { requester_result_id: s.result_id, peer_result_id: null, status: 'unmatched', fit: {}, draft_message: null, judge_score: null });
  }
  return { drafts: out.filter((r) => r.status === 'draft').length, unmatched: out.filter((r) => r.status === 'unmatched').length, skipped, matches: out };
}

export function parseJson(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON in model output');
  return JSON.parse(m[0]);
}
