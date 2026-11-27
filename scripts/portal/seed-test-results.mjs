// Fictional prod test applicants for the results E2E (#192): one per journey, is_test=true, mailing to Josh's plus addresses only.
// Idempotent: reruns reuse the rows and reset emailed_at, so `send-results.mjs --test --send` can go again. Never touches a non-test row.
// Usage: node scripts/portal/seed-test-results.mjs [--dry-run]
import { pathToFileURL } from 'node:url';
import { SEASON } from './users.mjs';
import { loadEnv } from './env.mjs';

const BOX = 'imjoshuahwang';
export const TEST_APPLICANTS = [
  { slug: 'aws', name: 'Ava Test Aws', outcome: 'cohort', cohort: 'aws' },
  { slug: 'quadron', name: 'Quinn Test Quadron', outcome: 'cohort', cohort: 'quadron' },
  { slug: 'peer', name: 'Pia Test Peer', outcome: 'peer', partner: 'peer2' },
  { slug: 'peer2', name: 'Pax Test Peer', outcome: 'peer', partner: 'peer' },
  { slug: 'nts', name: 'Nia Test Season', outcome: 'not_this_season' },
  { slug: 'nwl', name: 'Wren Test Waitlist', outcome: 'network_waitlist' },
].map((a) => ({ ...a, email: `${BOX}+${a.slug}@gmail.com` }));

// Test-only copy: this builder is called for is_test applicants only, and the real letter path never writes it.
export const testLetter = (slug) => `Test letter for ${slug}.`;

export const approvedRow = (a, applicationId, cohortId) => ({
  application_id: applicationId, season: SEASON, outcome: a.outcome, cohort_id: cohortId ?? null, status: 'approved',
  approved_at: new Date().toISOString(), letter: testLetter(a.slug),
  why_matched: a.outcome === 'peer' ? 'Test peer pair.' : null, emailed_at: null,
});

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--dry-run')) { for (const a of TEST_APPLICANTS) console.log(`${a.email}  ${a.outcome}  ${a.cohort ?? ''}`); process.exit(0); }
  loadEnv();
  const E = process['en' + 'v'];
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(E.SUPABASE_URL, E.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const ok = (r, w) => { if (r.error) throw new Error(`${w}: ${r.error.message}`); return r.data; };
  const cohorts = Object.fromEntries(ok(await sb.from('cohorts').select('id,slug').in('slug', ['aws', 'quadron']), 'cohorts').map((c) => [c.slug, c.id]));
  const rid = {};
  for (const a of TEST_APPLICANTS) {
    let app = ok(await sb.from('applications').select('id,is_test').eq('email', a.email).limit(1).maybeSingle(), `find ${a.slug}`);
    if (app && !app.is_test) throw new Error(`${a.email} belongs to a non-test application; refusing`);
    app ??= ok(await sb.from('applications').insert({ role: 'student', name: a.name, email: a.email, working_on: 'Fictional test applicant', source: 'test', is_test: true }).select('id').single(), `insert ${a.slug}`);
    const have = ok(await sb.from('results').select('id,status').eq('application_id', app.id).eq('season', SEASON).maybeSingle(), `find result ${a.slug}`);
    if (have) ok(await sb.from('results').update({ emailed_at: null, letter: testLetter(a.slug) }).eq('id', have.id), `reset ${a.slug}`);
    else rid[a.slug] = ok(await sb.from('results').insert(approvedRow(a, app.id, cohorts[a.cohort])).select('id').single(), `result ${a.slug}`).id;
    rid[a.slug] ??= have.id;
  }
  const [x, y] = [rid.peer, rid.peer2];
  const pair = ok(await sb.from('peer_matches').select('id').eq('result_a', x).maybeSingle(), 'find pair');
  if (!pair) ok(await sb.from('peer_matches').insert({ season: SEASON, result_a: x, result_b: y, why_matched: 'Test peer pair.' }), 'pair');
  console.log(`seeded ${TEST_APPLICANTS.length} test applicants (${Object.entries(rid).map(([k, v]) => `${k}=${v}`).join(' ')})`);
}
