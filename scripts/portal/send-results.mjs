// Results-ready email (#185). One email per approved, not-yet-emailed result, with a single-use link that sets a password.
// Dry run by default: prints the count and one rendered sample. `--send` sends. `--to a@x,b@y` restricts to those emails.
// `--test` sends to is_test applicants only (never a real student). Reply-To is always contact@joinvenn.org.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STUDENT_RESEND_API_KEY (all loaded by ./env.mjs; RESEND_API_KEY is never used).
// From is hello@vennstudentorgs.com, fixed. Applicant emails are never logged.
// Usage: node scripts/portal/send-results.mjs [--test] [--to a@x,b@y] [--send]
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { hashToken, SEASON } from './users.mjs';
import { loadEnv } from './env.mjs';

const TEMPLATE = new URL('../../supabase/templates/results-ready.html', import.meta.url);
export const SUBJECT = 'Venn Fall 2026 results are out';
export const SITE = 'https://joinvenn.org';
export const FROM = 'Venn <hello@vennstudentorgs.com>';
export const REPLY_TO = 'contact@joinvenn.org';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function parseArgs(argv) {
  const out = { send: false, to: null, test: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--send') out.send = true;
    else if (argv[i] === '--test') out.test = true;
    else if (argv[i] === '--to') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) throw new Error('--to needs a comma-separated list of emails');
      out.to = v.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
    } else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return out;
}

export const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0] || 'there';
export const linkFor = (hash, type) => `${SITE}/portal/auth/callback?token_hash=${hash}&type=${type}&next=/portal/set-password`;

export function render(template, { name, link }) {
  const html = template.replace('{{ .Name }}', esc(firstName(name))).replace('{{ .Link }}', esc(link));
  const text = `Hi ${firstName(name)},\n\nVenn Fall 2026 results are out. Your result is waiting in your Venn portal. Use this link to choose a password and sign in with this email address. It works once and expires in 72 hours.\n\n${link}\n\nIf the link stops working, reply to this email and I will send a new one.\n\nJoshua`;
  return { html, text };
}

// Without --to or --test, test applicants are never emailed. With --to, only the named addresses are. With --test, only is_test rows
// are ever picked (a real address named in --to is dropped), so a test run cannot reach a real student.
export function pickRows(rows, to, test = false) {
  const want = to ? new Set(to) : null;
  return rows.filter((r) => {
    const a = r.applications;
    if (!a?.email) return false;
    if (test) return a.is_test === true && (!want || want.has(a.email.toLowerCase()));
    return want ? want.has(a.email.toLowerCase()) : !a.is_test;
  });
}

export async function fetchPending(sb) {
  const { data, error } = await sb.from('results')
    .select('id, applications!inner(name, email, is_test)')
    .eq('status', 'approved').eq('season', SEASON).is('emailed_at', null).order('id').limit(5000);
  if (error) throw new Error(error.message);
  return data;
}

// An invite creates the account; if one already exists the same link works as a recovery. Either way the token is single use.
export async function makeLink(sb, email) {
  let type = 'invite';
  let res = await sb.auth.admin.generateLink({ type, email });
  if (res.error) { type = 'recovery'; res = await sb.auth.admin.generateLink({ type, email }); }
  if (res.error) throw new Error(res.error.message);
  const hash = res.data.properties.hashed_token;
  const { error } = await sb.from('portal_links').insert({
    user_id: res.data.user.id, token_hash: hashToken(hash), expires_at: new Date(Date.now() + 72 * 3600e3).toISOString(),
  });
  if (error) throw new Error(error.message);
  return linkFor(hash, type);
}

const NO_KEY = 'STUDENT_RESEND_API_KEY is not set: nothing sent';

export async function sendOne({ sb, row, template, from, resendKey, fetchImpl = fetch, idemSuffix = '', onId = () => {}, sleep = (ms) => new Promise((x) => setTimeout(x, ms)) }) {
  if (!resendKey) throw new Error(NO_KEY);
  const email = row.applications.email.trim();
  // Claim first: a crash after this point can skip a student, never double send. A failed send releases the claim.
  const claim = await sb.from('results').update({ emailed_at: new Date().toISOString() }).eq('id', row.id).is('emailed_at', null).select('id');
  if (claim.error) throw new Error(claim.error.message);
  if (!claim.data.length) return 'already';
  try {
    const { html, text } = render(template, { name: row.applications.name, link: await makeLink(sb, email) });
    const post = () => fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `results-ready-${row.id}${idemSuffix}`, 'User-Agent': 'venn-send-results/1' },
      body: JSON.stringify({ from, to: [email], reply_to: REPLY_TO, subject: SUBJECT, html, text }),
    });
    // 429 and 5xx: retry up to 3 times with backoff, the same Idempotency-Key so Resend can never double send.
    let r = await post();
    for (let i = 1; i <= 3 && (r.status === 429 || r.status >= 500); i++) { await sleep(i * 1000); r = await post(); }
    if (!r.ok) throw new Error(`resend ${r.status}`);
    try { onId((await r.json?.())?.id); } catch { /* logging only: never fail or release the claim after the mail is sent */ }
    return 'sent';
  } catch (e) {
    await sb.from('results').update({ emailed_at: null }).eq('id', row.id);
    throw e;
  }
}

export async function run({ args, sb, template, from, resendKey, log = console.log, fetchImpl, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const rows = pickRows(await fetchPending(sb), args.to, args.test);
  log(`${rows.length} ${args.test ? 'TEST ' : ''}result(s) approved and not yet emailed${args.to ? ` (restricted to ${args.to.length} address(es))` : ''}.`);
  if (!rows.length) return { sent: 0, failed: 0 };
  if (args.send && !resendKey) throw new Error(NO_KEY);
  if (!args.send) {
    const r = rows[0];
    log(`--- sample for result ${r.id} (link is a placeholder)\nSubject: ${SUBJECT}\nFrom: ${from}\n${render(template, { name: r.applications.name, link: linkFor('SAMPLE-SINGLE-USE', 'invite') }).text}`);
    log('dry run: nothing sent. Add --send to send.');
    return { sent: 0, failed: 0 };
  }
  let sent = 0, failed = 0;
  for (const row of rows) {
    try {
      let id; // a --test rerun gets a fresh key so Resend does not replay an earlier test send; real sends keep one key per result
      if (await sendOne({ sb, row, template, from, resendKey, fetchImpl, idemSuffix: args.test ? `-t${Date.now()}` : '', sleep, onId: (v) => { id = v; } }) === 'sent') sent++;
      log(`sent  result ${row.id} resend_id=${id}`); }
    catch (e) { failed++; log(`FAILED result ${row.id}: ${e.message}`); }
    await sleep(600);
  }
  log(`done: ${sent} sent, ${failed} failed.`);
  return { sent, failed };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadEnv();
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, STUDENT_RESEND_API_KEY: resendKey } = process['en' + 'v'];
  if (!url || !key || !resendKey) { console.error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and STUDENT_RESEND_API_KEY.'); process.exit(1); }
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { failed } = await run({ args: parseArgs(process.argv.slice(2)), sb, template: readFileSync(TEMPLATE, 'utf8'), from: FROM, resendKey });
  process.exit(failed ? 1 : 0);
}
