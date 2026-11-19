// Portal phone QA: `npm run qa:portal -- --base-url <url> [--flow name]`. Flows live in qa/portal-flows.yaml; a flow with `pending: N`
// is skipped while issue N is open (offline = stays pending, never PASS). QA_PENDING=run overrides. Local Supabase only.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { slug } from './devices.mjs';

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
