// Portal phone QA: `npm run qa:portal -- --base-url <url> [--flow name]`. Flows live in qa/portal-flows.yaml; a flow with `pending: N`
// is skipped while issue N is open (offline = stays pending, never PASS). QA_PENDING=run overrides. Local Supabase only.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { slug } from './devices.mjs';
import { SUPABASE_BLOCK } from './flows.mjs';

export const PORTAL_FILE = 'qa/portal-flows.yaml';
const REPO = 'imjoshuahwang/venn-site';
const TEST_ADDR = /^contact\+portal-[a-z0-9-]+@joinvenn\.org$/;

export const ghLookup = async (n) => JSON.parse(execFileSync('gh', ['issue', 'view', String(n), '-R', REPO, '--json', 'state'], { encoding: 'utf8', timeout: 15000 })).state;

// -> { run, skipped: [{ ...flow, reason }] }. lookup(n) resolves 'OPEN'|'CLOSED' and may throw (offline).
export async function splitPending(flows, { lookup = ghLookup, env = process.env, only } = {}) {
  const run = [], skipped = [];
  for (const f of flows.filter((x) => !only || x.name === only)) {
    let open = false;
    if (f.pending && env.QA_PENDING !== 'run') {
      try { open = (await lookup(f.pending)) !== 'CLOSED'; } catch { open = true; }
    }
    if (open) skipped.push({ ...f, reason: `skipped (pending #${f.pending})` }); else run.push(f);
  }
  return { run, skipped };
}

export function assertTestAddress(addr) {
  if (!TEST_ADDR.test(addr)) throw new Error(`refusing non-test address "${addr}"; only contact+portal-<slug>@joinvenn.org`);
}

export const shotPath = (device, flow, step) => `qa/portal-shots/${slug(device)}/${flow}-${step}.png`;

// One adapter for seeded logins: the #118 module when it exists, else env. Wire #118 by fixing SEED_MODULE.
const SEED_MODULE = '../portal/seed-users.mjs';
export async function loadSeedLogin({ env = process.env, importer = (m) => import(m) } = {}) {
  try {
    const mod = await importer(SEED_MODULE);
    const u = (mod.SEEDED_USERS || mod.users || [])[0];
    if (u?.email) return { email: u.email, password: env.PORTAL_TEST_PASSWORD || u.password };
  } catch { /* #118 not merged yet */ }
  return { email: 'contact+portal-t1@joinvenn.org', password: env.PORTAL_TEST_PASSWORD };
}

// ---- runner ----
const LOCAL_SUPABASE = 'http://127.0.0.1:54321';
const DEVICES = ['iPhone SE', 'iPhone 15', 'Pixel 7'];
const CLS_PORTAL = 0.05;
const unq = (s) => s.trim().replace(/^(["'])(.*)\1$/, '$2');

// Creates the login user on the local stack (Node only, admin API, no invite mail). Local URL only.
export async function ensureSeedUser({ email, password }, { env = process.env, fetchImpl = fetch } = {}) {
  assertTestAddress(email);
  const url = env.SUPABASE_URL || LOCAL_SUPABASE;
  if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url)) throw new Error(`refusing non-local Supabase ${url}`);
  let key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) key = JSON.parse(execFileSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).SERVICE_ROLE_KEY;
  const h = { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' };
  const r = await fetchImpl(`${url}/auth/v1/admin/users`, { method: 'POST', headers: h, body: JSON.stringify({ email, password, email_confirm: true }) });
  if (r.ok) return 'created';
  const list = await (await fetchImpl(`${url}/auth/v1/admin/users?per_page=1000`, { headers: h })).json();
  const u = (list.users || []).find((x) => x.email === email);
  if (!u) throw new Error(`seed user ${email}: ${r.status}`);
  await fetchImpl(`${url}/auth/v1/admin/users/${u.id}`, { method: 'PUT', headers: h, body: JSON.stringify({ password, email_confirm: true }) });
  return 'updated';
}

async function runPortalFlow({ flow, device, browser, base, login }) {
  const { contextOptions } = await import('./devices.mjs');
  const { prepare, runChecks } = await import('./checks.mjs');
  const { runStep } = await import('./flows.mjs');
  const dir = shotPath(device.name, flow.name, 'x').replace(/[^/]+$/, '');
  fs.mkdirSync(dir, { recursive: true });
  const sess = {};
  const open = async (name) => {
    const ctx = await browser.newContext(contextOptions(device));
    const page = await ctx.newPage();
    await page.route(SUPABASE_BLOCK, (r) => r.abort());
    const state = await prepare(page);
    state.clsMax = CLS_PORTAL;
    await page.goto(new URL(flow.on || '/', base).href, { waitUntil: 'load', timeout: 45000 });
    sess[name] = { ctx, page, state };
    return sess[name];
  };
  let cur = await open('default');
  const sub = (s) => s.replaceAll('{email}', login.email).replaceAll('{password}', login.password || '');
  let step = '', lastShot = shotPath(device.name, flow.name, 'start');
  const shot = async (name) => {
    lastShot = shotPath(device.name, flow.name, slug(name));
    await cur.page.screenshot({ path: lastShot }).catch(() => {});
  };
  try {
    const ctx = { timeout: 10000, afterLoad: async () => {}, shot };
    for (const [i, raw] of flow.steps.entries()) {
      step = `step ${i + 1} "${raw}"`;
      const s = sub(raw), verb = s.trim().split(/\s+/)[0], rest = s.trim().slice(verb.length).trim();
      const p = cur.page;
      if (verb === 'new-context') await open(unq(rest));
      else if (verb === 'as') cur = sess[unq(rest)] || (() => { throw new Error(`no context "${rest}"`); })();
      else if (verb === 'expect-url') await p.waitForURL((u) => (u.pathname + u.search).includes(unq(rest)), { timeout: 10000 });
      else if (verb === 'sign-in') {
        await p.goto(new URL('/portal/login', base).href, { waitUntil: 'load' });
        assertTestAddress(rest || login.email);
        await p.fill('input[name=email]', rest || login.email);
        await p.fill('input[name=password]', login.password || '');
        await Promise.all([p.waitForURL((u) => !u.pathname.endsWith('/portal/login'), { timeout: 15000 }), p.click('button[type=submit]')]);
      } else if (verb === 'sign-out') {
        await p.evaluate(() => fetch('/portal/logout', { method: 'POST' }));
      } else if (verb === 'fill' && /email/.test(s)) {
        const v = s.match(/^fill\s+("[^"]*"|'[^']*'|\S+)\s+(.*)$/)?.[2] ?? '';
        assertTestAddress(v.trim());
        await runStep(p, s, ctx);
      } else await runStep(p, s, ctx);
      cur.page = cur.page;
    }
    await shot('final');
    const fails = [];
    for (const [name, x] of Object.entries(sess)) {
      await x.page.waitForTimeout(400);
      for (const r of await runChecks(x.page, x.state)) if (!r.pass) fails.push(`${name}: ${r.check} ${r.details}`);
    }
    if (fails.length) throw Object.assign(new Error(fails.join('; ')), { step: 'checks' });
    return { pass: true, details: `${flow.steps.length} steps`, shot: lastShot };
  } catch (e) {
    await cur.page.screenshot({ path: shotPath(device.name, flow.name, 'fail') }).catch(() => {});
    return { pass: false, details: `${e.step || step}: ${String(e.message).split('\n')[0]} (${shotPath(device.name, flow.name, 'fail')})` };
  } finally {
    for (const x of Object.values(sess)) await x.ctx.close().catch(() => {});
  }
}

export async function main(argv = process.argv.slice(2)) {
  const { parseCli } = await import('./cli.mjs');
  const { loadFlows } = await import('./flows.mjs');
  const { resolveDevices } = await import('./devices.mjs');
  const { chromium, webkit } = await import('playwright');
  const cli = parseCli(argv);
  const base = process.argv.slice(2).some((a) => a.startsWith('--base-url')) || cli.base !== 'http://127.0.0.1:4321' ? cli.base : 'http://localhost:8000';
  const devices = resolveDevices({ names: cli.devices || DEVICES });
  const { run, skipped } = await splitPending(loadFlows(PORTAL_FILE), { only: cli.flow });
  if (cli.flow && !run.length && !skipped.length) { console.error(`no flow named ${cli.flow}`); return 2; }
  const login = await loadSeedLogin();
  login.password ||= 'qa-portal-local-pass-1';
  if (run.some((f) => f.steps.some((s) => s.includes('{email}') || s.startsWith('sign-in')))) {
    try { await ensureSeedUser(login); } catch (e) { console.error(`seed user: ${e.message}`); return 2; }
  }
  console.log(`qa:portal ${base}: ${run.length} live + ${skipped.length} pending flows x ${devices.length} devices`);
  const browsers = {};
  for (const n of new Set(devices.map((d) => d.browser))) browsers[n] = await { chromium, webkit }[n].launch();
  let failed = 0;
  try {
    for (const flow of run) for (const d of devices) {
      const r = await runPortalFlow({ flow, device: d, browser: browsers[d.browser], base, login });
      if (!r.pass) failed++;
      console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${flow.name}  ${d.name}  ${r.details}`);
    }
  } finally {
    await Promise.all(Object.values(browsers).map((b) => b.close()));
  }
  for (const f of skipped) for (const d of devices) console.log(`PENDING  ${f.name}  ${d.name}  ${f.reason}`);
  console.log(`\n${run.length * devices.length - failed} pass, ${failed} fail, ${skipped.length * devices.length} pending`);
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(await main());
