// Idempotent portal test-user seed (#118). Usage: npm run seed:portal -- --yes [--dry-run] [--target preview]
// Creates confirmed auth users via the admin API (no mail), Test applications (source='test'), and approved Results
// on those test rows only. Never deletes real data; --reset-test-state only resets local test users' consents and signatures.
import { buildPlan, resolveTarget, emailFor, SEEDED_USERS, UNCONSENTED, CONSENT_VERSION, CONSENT_CLAUSES, TEST_PASSWORD_DEFAULT, SEASON } from './users.mjs';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const target = argv.includes('--target') ? argv[argv.indexOf('--target') + 1] : 'local';
const plan = buildPlan();

if (flag('--dry-run')) {
  for (const u of SEEDED_USERS) console.log(`${u.email}  outcome=${u.outcome}  status=${u.status}  landing=${u.landing}`);
  console.log(`parent co-sign (pending): ${plan.parent.parent_email}`);
  process.exit(0);
}
if (!flag('--yes')) { console.error('refusing without --yes (or use --dry-run)'); process.exit(2); }

let t;
try { t = resolveTarget({ target, env: process.env }); } catch (e) { console.error(e.message); process.exit(2); }
const password = process.env.PORTAL_TEST_PASSWORD || TEST_PASSWORD_DEFAULT;
const { createClient } = await import('@supabase/supabase-js');
const sb = createClient(t.url, t.key, { auth: { persistSession: false, autoRefreshToken: false } });
const ok = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };

async function authIdByEmail() {
  const map = new Map();
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    for (const u of data.users) map.set(u.email, u.id);
    if (data.users.length < 1000) return map;
  }
}

const ids = await authIdByEmail();
for (const u of SEEDED_USERS) {
  if (ids.has(u.email)) continue;
  const d = ok(await sb.auth.admin.createUser({ email: u.email, password, email_confirm: true }), `createUser ${u.slug}`);
  ids.set(u.email, d.user.id);
}

const cohortId = {};
for (const c of plan.cohorts) {
  cohortId[c.slug] = ok(await sb.from('cohorts').upsert(c, { onConflict: 'slug' }).select('id').single(), `cohort ${c.slug}`).id;
}

const appId = {}, resId = {};
for (const r of plan.results) {
  const key = (await sb.rpc('email_key', { e: r.email })).data;
  let app = ok(await sb.from('applications').select('id,is_test').eq('email_key', key).maybeSingle(), `find app ${r.slug}`);
  if (app && !app.is_test) throw new Error(`application for ${r.email} is not a test row; refusing`);
  if (!app) {
    app = ok(await sb.from('applications').insert({
      role: 'student', name: `Portal Test ${r.slug}`, email: r.email, working_on: 'Portal test seed', source: 'test',
    }).select('id').single(), `insert app ${r.slug}`);
  }
  appId[r.slug] = app.id;
  resId[r.slug] = ok(await sb.from('results').upsert({
    application_id: app.id, season: SEASON, outcome: r.outcome, cohort_id: r.cohort ? cohortId[r.cohort] : null,
    status: r.status, approved_at: r.approved_at, letter: r.letter, ceremony_done_at: r.ceremony_done_at, why_matched: r.why_matched,
  }, { onConflict: 'application_id,season' }).select('id').single(), `result ${r.slug}`).id;
}

if (flag('--reset-test-state')) {
  const unconsented = plan.results.filter((x) => UNCONSENTED.includes(x.slug)).map((x) => ids.get(x.email));
  ok(await sb.from('consents').delete().in('user_id', unconsented), 'reset consents');
}
for (const r of plan.results.filter((x) => !UNCONSENTED.includes(x.slug))) {
  const rows = CONSENT_CLAUSES.map((clause) => ({ user_id: ids.get(r.email), clause, accepted: true, version: CONSENT_VERSION }));
  ok(await sb.from('consents').upsert(rows, { onConflict: 'user_id,clause,version' }), `consent ${r.slug}`);
}

for (const p of plan.pairs) {
  const have = ok(await sb.from('peer_matches').select('id').eq('result_a', resId[p.a]).maybeSingle(), `find pair ${p.a}`);
  const downs = { a_down_at: p.a_down ? '2026-11-03T00:00:00Z' : null, b_down_at: p.b_down ? '2026-11-03T00:00:00Z' : null };
  if (have && flag('--reset-test-state')) ok(await sb.from('peer_matches').update(downs).eq('id', have.id), `reset pair ${p.a}`);
  if (!have) ok(await sb.from('peer_matches').insert({
    season: SEASON, result_a: resId[p.a], result_b: resId[p.b], why_matched: p.why_matched,
    ...downs,
  }), `pair ${p.a}`);
}

for (const m of plan.matches) {
  ok(await sb.from('match_pool').upsert({ result_id: resId[m.peer], is_test: true }, { onConflict: 'result_id' }), `pool ${m.peer}`);
  const have = ok(await sb.from('matches').select('id').eq('requester_result_id', resId[m.requester]).eq('peer_result_id', resId[m.peer]).maybeSingle(), `find match ${m.requester}`);
  const row = { season: SEASON, requester_result_id: resId[m.requester], peer_result_id: resId[m.peer], status: m.status, fit: m.fit };
  if (have) ok(await sb.from('matches').update({ status: m.status, fit: m.fit, viewed_at: null }).eq('id', have.id), `reset match ${m.requester}`);
  else ok(await sb.from('matches').insert(row), `match ${m.requester}`);
}

// Signatures: cohort-full-b always holds the one seat of test-cohort-full; --reset-test-state clears every other test signature so mou-sign can rerun.
{
  const keep = resId['cohort-full-b'];
  const mine = Object.values(resId).filter((id) => id !== keep);
  if (flag('--reset-test-state')) ok(await sb.from('mou_signatures').delete().in('result_id', mine), 'reset signatures');
  const has = ok(await sb.from('mou_signatures').select('id').eq('result_id', keep).maybeSingle(), 'find seat signature');
  if (!has) ok(await sb.from('mou_signatures').insert({
    result_id: keep, cohort_id: cohortId['test-cohort-full'], typed_name: 'Seat Holder', agreed: true, user_id: ids.get(emailFor('cohort-full-b')),
  }), 'seat signature');
}

for (const m of plan.teamMembers) {
  const key = (await sb.rpc('email_key', { e: m.email })).data;
  const have = ok(await sb.from('team_members').select('id').eq('lead_result_id', resId[m.lead]).eq('email_key', key).is('removed_at', null).maybeSingle(), `find member ${m.slug}`);
  if (!have) ok(await sb.from('team_members').insert({ lead_result_id: resId[m.lead], email_key: key }), `member ${m.slug}`);
}

ok(await sb.from('parent_consents').upsert({
  user_id: ids.get(emailFor(plan.parent.user)), parent_email: plan.parent.parent_email,
  token_hash: plan.parent.token_hash, expires_at: '2036-01-01T00:00:00Z', signed_at: null,
}, { onConflict: 'token_hash' }), 'parent_consents');

const n = async (table, f) => { const q = sb.from(table).select('*', { count: 'exact', head: true }); const r = await (f ? f(q) : q); if (r.error) throw new Error(r.error.message); return r.count; };
const summary = {
  auth_users: SEEDED_USERS.filter((u) => ids.has(u.email)).length,
  applications: await n('applications', (q) => q.like('email', 'contact+portal-%')),
  results: await n('results', (q) => q.in('application_id', Object.values(appId))),
  peer_matches: await n('peer_matches', (q) => q.in('result_a', Object.values(resId))),
  team_members: await n('team_members', (q) => q.in('lead_result_id', Object.values(resId))),
  parent_consents: await n('parent_consents', (q) => q.like('parent_email', 'contact+portal-%')),
};
for (const u of SEEDED_USERS) console.log(`${u.email}  ${u.outcome}  ${u.landing}`);
console.log('SUMMARY ' + JSON.stringify(summary));
