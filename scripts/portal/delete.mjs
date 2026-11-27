// Dry run only: lists every row tied to one person. Read-only queries; nothing here can write or delete.
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run delete-request -- --email <addr>
import { pathToFileURL } from 'node:url';

export const TABLES = [
  'applications', 'results', 'peer_matches', 'mou_signatures', 'consents',
  'parent_consents', 'team_members', 'guiding_answers', 'portal_links', 'auth.users', 'rs_events',
  'match_pool', 'matches', 'match_events', 'match_blocks',
];

// Mirrors public.email_key().
export function emailKey(e) {
  const [u = '', d = ''] = String(e).trim().toLowerCase().split('@');
  if (d === 'gmail.com' || d === 'googlemail.com') return u.split('+')[0].replace(/\./g, '') + '@gmail.com';
  return u.split('+')[0] + '@' + d;
}

export function parseArgs(argv) {
  let email;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--email') email = argv[++i];
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (!email || email.startsWith('--') || !email.includes('@')) throw new Error('--email <address> is required');
  return { email };
}

async function ids2(q) {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.result_id);
}

async function ids(q) {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.id);
}

export async function buildPlan(client, email) {
  const key = emailKey(email);
  const read = (t, cols = 'id') => client.from(t).select(cols);

  const apps = await ids(read('applications').eq('email_key', key));
  const results = apps.length ? await ids(read('results').in('application_id', apps)) : [];

  const { data: users, error } = await client.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(error.message);
  const userIds = (users?.users ?? []).filter((u) => u.email && emailKey(u.email) === key).map((u) => u.id);

  const byResult = (t, c) => (results.length ? ids(read(t).in(c, results)) : []);
  const byUser = (t) => Promise.all(userIds.map((u) => ids(read(t).eq('user_id', u)))).then((x) => x.flat());
  const uniq = (a) => [...new Set(a)];

  const matchIds = results.length
    ? uniq([...(await byResult('matches', 'requester_result_id')), ...(await byResult('matches', 'peer_result_id'))])
    : [];
  const tables = {
    applications: apps,
    results,
    peer_matches: uniq([...(await byResult('peer_matches', 'result_a')), ...(await byResult('peer_matches', 'result_b'))]),
    mou_signatures: uniq([...(await byResult('mou_signatures', 'result_id')), ...(await byUser('mou_signatures'))]),
    consents: await byUser('consents'),
    parent_consents: await byUser('parent_consents'),
    team_members: uniq([
      ...(await byResult('team_members', 'lead_result_id')),
      ...(await ids(read('team_members').eq('email_key', key))),
      ...(await byUser('team_members')),
    ]),
    guiding_answers: await byResult('guiding_answers', 'result_id'),
    portal_links: await byUser('portal_links'),
    match_pool: results.length ? await ids2(read('match_pool', 'result_id').in('result_id', results)) : [],
    matches: matchIds,
    match_events: matchIds.length ? await ids(read('match_events').in('match_id', matchIds)) : [],
    match_blocks: apps.length ? await Promise.all([
      client.from('match_blocks').select('peer_result_id').in('application_id', apps),
      results.length ? client.from('match_blocks').select('peer_result_id').in('peer_result_id', results) : { data: [] },
    ]).then((rs) => uniq(rs.flatMap((r) => (r.data ?? []).map((x) => x.peer_result_id)))) : [],
    'auth.users': userIds,
    rs_events: await ids(read('rs_events').eq('email', String(email).trim().toLowerCase())),
  };
  for (const k of Object.keys(tables)) tables[k] = [...tables[k]].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { email, tables: Object.fromEntries(TABLES.map((t) => [t, tables[t]])) };
}

export function formatPlan(plan) {
  const lines = [`Dry run for ${plan.email}. Nothing is deleted.`];
  for (const [t, list] of Object.entries(plan.tables)) {
    const note = t === 'rs_events' ? '  (count only, flagged for #136)' : t === 'auth.users' ? '  (read only)' : '';
    lines.push(`${t.padEnd(16)} ${String(list.length).padStart(3)}  ${list.join(', ')}${note}`);
  }
  return lines.join('\n');
}

async function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(2); }
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required'); process.exit(2); }
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  console.log(formatPlan(await buildPlan(client, args.email)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e.message); process.exit(1); });
