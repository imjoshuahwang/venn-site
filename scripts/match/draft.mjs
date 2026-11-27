// Match drafter and judge (#246). Usage: node scripts/match/draft.mjs --season fall-2026 [--dry] [--limit N] [--write [--target local|preview]]
// Dry by default: prints JSON, writes nothing. --write inserts status 'draft' or 'unmatched' rows, local or preview DB only (never prod).
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { promisify } from 'node:util';
import { draftAll, parseJson } from './draft-lib.mjs';

const run = promisify(execFile);
const dir = new URL('./', import.meta.url);
const prompt = (n) => readFileSync(new URL(`prompts/${n}.md`, dir), 'utf8');
const facts = () => { try { return readFileSync(`${homedir()}/venn/venn-facts.md`, 'utf8'); } catch { return ''; } };

async function claude(text) {
  const { stdout } = await run('claude', ['-p', text], { maxBuffer: 1 << 22, timeout: 120000 });
  return parseJson(stdout);
}
export const generate = (me, peer) => claude(`${prompt('draft')}\n\n${JSON.stringify({ sender: me, peer, venn_facts: facts() })}`);

const levels = ['1 poor', '2 weak', '3 fair', '4 good', '5 excellent'];
async function jev(me, peer, d, token) {
  const r = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ model: 'jev-latest', state: JSON.stringify({ sender: me, peer, draft: d }), questions: {
      fit: { type: 'score', instructions: 'Would these two students get real value from meeting, given what each builds and needs?', criteria: levels },
      specificity: { type: 'score', instructions: 'Does the message name something concrete about the peer rather than a generic compliment?', criteria: levels } } }),
  });
  if (!r.ok) throw new Error(`jev ${r.status}`);
  const a = (await r.json()).answers;
  return { fit: Math.round(a.fit.score), specificity: Math.round(a.specificity.score) };
}
export async function judge(me, peer, d) {
  const token = process.env.TYPESAFE_API_KEY;
  if (token) { try { return await jev(me, peer, d, token); } catch { /* fall back to Claude */ } }
  return claude(`${prompt('judge')}\n\n${JSON.stringify({ sender: me, peer, draft: d })}`);
}

async function load(sb, season) {
  const ok = (r, w) => { if (r.error) throw new Error(`${w}: ${r.error.message}`); return r.data; };
  const rows = ok(await sb.from('results').select('id,application_id,season,outcome,cohort_id,applications(name,org,level,working_on,need,is_test)').eq('season', season).eq('status', 'approved'), 'results');
  const flat = rows.map((r) => ({ result_id: r.id, application_id: r.application_id, season: r.season, outcome: r.outcome, cohort_id: r.cohort_id, ...r.applications }));
  const byId = new Map(flat.map((s) => [s.result_id, s]));
  const pool = ok(await sb.from('match_pool').select('*'), 'match_pool');
  const peers = pool.filter((p) => byId.has(p.result_id)).map((p) => ({ ...byId.get(p.result_id), opted_out_at: p.opted_out_at, paused_at: p.paused_at, max_open: p.max_open, is_test: p.is_test || byId.get(p.result_id).is_test }));
  const poolBy = new Map(pool.map((p) => [p.result_id, p]));
  const requesters = flat.filter((s) => s.outcome !== 'cohort' && s.cohort_id == null).map((s) => ({ ...s, opted_out_at: poolBy.get(s.result_id)?.opted_out_at, paused_at: poolBy.get(s.result_id)?.paused_at }));
  const matches = ok(await sb.from('matches').select('requester_result_id,peer_result_id,status').eq('season', season), 'matches');
  const blocks = ok(await sb.from('match_blocks').select('peer_result_id,application_id'), 'match_blocks');
  return { requesters, peers, matches, blocks };
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
  const season = arg('--season', 'fall-2026');
  const write = argv.includes('--write') && !argv.includes('--dry');
  const limit = arg('--limit') ? Number(arg('--limit')) : undefined;
  const { loadEnv } = await import('../portal/env.mjs');
  const { resolveTarget } = await import('../portal/users.mjs');
  loadEnv();
  const t = resolveTarget({ target: arg('--target', 'local'), env: process.env });
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(t.url, t.key, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await draftAll({ ...(await load(sb, season)), generate, judge, limit });
  console.log(JSON.stringify({ season, dry: !write, target: t.target, ...result }, null, 2));
  if (write && result.matches.length) {
    const { error } = await sb.from('matches').insert(result.matches.map((m) => ({ season, ...m })));
    if (error) throw new Error(`insert: ${error.message}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
