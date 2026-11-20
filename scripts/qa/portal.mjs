// Portal phone QA: `npm run qa:portal -- --base-url <url> [--flow name]`. Flows live in qa/portal-flows.yaml; a flow with `pending: N`
// is skipped while issue N is open (offline = stays pending, never PASS). QA_PENDING=run overrides. Local Supabase only.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
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

// Login for {email} / sign-in: the #118 seed user "cohort" (fresh ceremony), password as seeded.
export async function loadSeedLogin({ env = process.env, importer = (m) => import(m) } = {}) {
  const mod = await importer('../portal/users.mjs');
  const u = mod.SEEDED_USERS.find((x) => x.slug === 'cohort');
  return { email: u.email, password: env.PORTAL_TEST_PASSWORD || mod.TEST_PASSWORD_DEFAULT };
}

// `supabase status -o json|env` text -> the browser-safe env for astro dev. Local stack only, anon key only.
export function localSupabaseEnv(text) {
  let o;
  try { o = JSON.parse(text); } catch {
    o = Object.fromEntries([...String(text).matchAll(/^([A-Z_]+)="?([^"\n]*)"?$/gm)].map((m) => [m[1], m[2]]));
  }
  if (!o.API_URL) throw new Error('no API_URL in supabase status output; is the local stack up (supabase start)?');
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(o.API_URL)) throw new Error(`refusing: Supabase API_URL ${o.API_URL} is not local`);
  if (!o.ANON_KEY) throw new Error('no ANON_KEY in supabase status output');
  return { PUBLIC_SUPABASE_URL: o.API_URL, PUBLIC_SUPABASE_ANON_KEY: o.ANON_KEY, ...TURNSTILE_LOCAL };
}

// Cloudflare's documented always-pass TEST keys. Local/dev harness only: they override any real key in the shell, and prod config never reads this file.
export const TURNSTILE_LOCAL = {
  PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
  TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
};

// Local DB only: drops the rate-limit counters so one flow's sign-ins never lock out the next.
export function clearRateLimits(execFile = execFileSync) {
  try {
    execFile('psql', ['postgresql://postgres:postgres@127.0.0.1:54322/postgres', '-qc', 'truncate public.portal_rate_hits'], { stdio: 'ignore' });
  } catch { /* stack without the table or psql: the dev server's in-memory limiter is per run anyway */ }
}

// Local DB only: puts a seeded user back to a fresh first visit so each device run starts at the sealed card.
export function resetCeremony(slug, execFile = execFileSync) {
  const email = `contact+portal-${slug}@joinvenn.org`;
  assertTestAddress(email);
  execFile('psql', ['postgresql://postgres:postgres@127.0.0.1:54322/postgres', '-qc',
    `update public.results r set viewed_at = null, ceremony_done_at = null from public.applications a where a.id = r.application_id and a.email = '${email}'`], { stdio: 'ignore' });
}

// ---- runner ----
const DEVICES = ['iPhone SE', 'iPhone 15', 'Pixel 7'];
const CLS_PORTAL = 0.05;
const unq = (s) => s.trim().replace(/^(["'])(.*)\1$/, '$2');

// Starts astro dev wired to the local stack; resolves { url, stop }.
async function startDev(env) {
  const port = 4333, url = `http://127.0.0.1:${port}`;
  const child = spawn('npx', ['astro', 'dev', '--host', '127.0.0.1', '--port', String(port)], { env: { ...process.env, ...env, PORTAL_JOSH_PHONE: process.env.PORTAL_JOSH_PHONE || '+16505550100' }, stdio: 'ignore' });
  for (let i = 0; i < 120; i++) {
    if (await fetch(url).then(() => true, () => false)) return { url, stop: () => child.kill() };
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error('astro dev did not start');
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
    state.seen = []; state.allow = [];
    page.on('response', (r) => state.seen.push({ status: r.status(), url: r.url() }));
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
      if (verb === 'new-context') cur = await open(unq(rest));
      else if (verb === 'as') cur = sess[unq(rest)] || (() => { throw new Error(`no context "${rest}"`); })();
      else if (verb === 'reset-test-state') execFileSync('node', ['scripts/portal/seed.mjs', '--yes', '--reset-test-state'], { stdio: 'ignore', env: { ...process.env, PORTAL_TEST_PASSWORD: login.password } });
      else if (verb === 'double-tap') await p.locator(unq(rest)).filter({ visible: true }).first().dblclick({ timeout: 10000 });
      else if (verb === 'allow-error') { const [st, ...re] = rest.split(/\s+/); cur.state.allow.push({ status: Number(st), re: new RegExp(unq(re.join(' '))) }); } // scoped to this flow, this context, one status + url
      else if (verb === 'expect-absent') { await p.locator(unq(rest)).filter({ visible: true }).first().waitFor({ state: 'hidden', timeout: 10000 }).catch(() => { throw new Error(`"${rest}" is visible`); }); }
      else if (verb === 'expect-content' || verb === 'expect-no-content') {
        const hit = new RegExp(unq(rest), 'i').test(await p.content());
        if (verb === 'expect-content' && !hit) throw new Error(`page has no /${rest}/`);
        if (verb === 'expect-no-content' && hit) throw new Error(`page content matches /${rest}/`);
      }
      else if (verb === 'expect-url') await p.waitForURL((u) => (u.pathname + u.search).includes(unq(rest)), { timeout: 10000 });
      else if (verb === 'sign-in') {
        await p.goto(new URL('/portal/login', base).href, { waitUntil: 'load' });
        assertTestAddress(rest || login.email);
        await p.fill('input[name=email]', rest || login.email);
        await p.fill('input[name=password]', login.password || '');
        await p.waitForFunction(() => document.querySelector('input[name="cf-turnstile-response"]')?.value, null, { timeout: 15000 }); // always-pass widget fills this async
        await Promise.all([p.waitForURL((u) => !u.pathname.endsWith('/portal/login'), { timeout: 15000 }), p.click('button[type=submit]')]);
      } else if (verb === 'reset-ceremony') {
        resetCeremony(unq(rest));
      } else if (verb === 'reduced-motion') {
        await p.emulateMedia({ reducedMotion: 'reduce' });
        await p.reload({ waitUntil: 'load' });
      } else if (verb === 'expect-gone') {
        await p.locator(unq(rest)).first().waitFor({ state: 'detached', timeout: 10000 });
      } else if (verb === 'sign-out') {
        await p.evaluate(() => fetch('/portal/logout', { method: 'POST' }));
      } else if (verb === 'fill' && /email/.test(s)) {
        const v = s.match(/^fill\s+("[^"]*"|'[^']*'|\S+)\s+(.*)$/)?.[2] ?? '';
        assertTestAddress(v.trim());
        await runStep(p, s, ctx);
      } else await runStep(p, s, ctx);
      cur.page = cur.page;
    }
    const fails = [];
    for (const [name, x] of Object.entries(sess)) {
      await x.page.waitForTimeout(400);
      for (const a of x.state.allow) { // drop the one console line a declared response produced; no such response = the declaration fails
        if (!x.state.seen.some((r) => r.status === a.status && a.re.test(r.url))) { fails.push(`${name}: allow-error ${a.status} ${a.re} never happened`); continue; }
        const i = x.state.console.findIndex((m) => m.includes(`status of ${a.status}`));
        if (i >= 0) x.state.console.splice(i, 1);
      }
      for (const r of await runChecks(x.page, x.state)) if (!r.pass) fails.push(`${name}: ${r.check} ${r.details}`);
    }
    if (fails.length) throw Object.assign(new Error(fails.join('; ')), { step: 'checks' });
    return { pass: true, details: `${flow.steps.length} steps`, shot: lastShot };
  } catch (e) {
    return { pass: false, details: `${e.step || step}: ${String(e.message).split('\n')[0]}` };
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
  let base = cli.explicitBase ?? (process.argv.slice(2).some((a) => a.startsWith('--base-url')) ? cli.base : null), dev;
  const devices = resolveDevices({ names: cli.devices || DEVICES });
  const { run, skipped } = await splitPending(loadFlows(PORTAL_FILE), { only: cli.flow });
  if (cli.flow && !run.length && !skipped.length) { console.error(`no flow named ${cli.flow}`); return 2; }
  const login = await loadSeedLogin();
  try {
    const sbEnv = localSupabaseEnv(execFileSync('supabase', ['status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
    if (!base) { dev = await startDev(sbEnv); base = dev.url; }
    if (run.some((f) => f.steps.some((s) => s.includes('{email}') || s.startsWith('sign-in')))) {
      execFileSync('node', ['scripts/portal/seed.mjs', '--yes'], { stdio: 'ignore', env: { ...process.env, PORTAL_TEST_PASSWORD: login.password } });
    }
  } catch (e) { dev?.stop(); console.error(`setup: ${e.message}`); return 1; }
  console.log(`qa:portal ${base}: ${run.length} live + ${skipped.length} pending flows x ${devices.length} devices`);
  const browsers = {};
  for (const n of new Set(devices.map((d) => d.browser))) browsers[n] = await { chromium, webkit }[n].launch();
  let failed = 0;
  try {
    for (const flow of run) for (const d of devices) {
      clearRateLimits();
      const r = await runPortalFlow({ flow, device: d, browser: browsers[d.browser], base, login });
      if (!r.pass) failed++;
      console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${flow.name}  ${d.name}  ${r.details}`);
    }
  } finally {
    await Promise.all(Object.values(browsers).map((b) => b.close()));
    dev?.stop();
  }
  for (const f of skipped) for (const d of devices) console.log(`PENDING  ${f.name}  ${d.name}  ${f.reason}`);
  console.log(`\n${run.length * devices.length - failed} pass, ${failed} fail, ${skipped.length * devices.length} pending`);
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(await main());
