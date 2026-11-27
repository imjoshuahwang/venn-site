// Walks the four results journeys on PROD at phone width, as the fictional is_test applicants (#192). Usage: npm run qa:results [-- --out DIR] [--only aws,quadron]
// Each journey: action link (same generateLink + redirect the email uses) -> set password -> user in auth.users -> consent -> result -> slides -> mailto.
// Content in the slides/mailto area belongs to other builders, so a mismatch there is reported as MISMATCH, not a failure. Auth, link and routing problems FAIL.
// Run after `node scripts/portal/seed-test-results.mjs`. Never touches a non-test row: it refuses any email whose application is not is_test.
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadEnv } from '../portal/env.mjs';

export const SITE = 'https://joinvenn.org';
export const BOX = 'imjoshuahwang';
export const CONTACT = 'contact@joinvenn.org';
export const JOURNEYS = {
  aws: { to: CONTACT, cc: null },
  quadron: { to: 'dan@quadron.work', cc: CONTACT },
  peer: { partner: 'Pax' },
  nts: {},
};

// "mailto:a@b?cc=c@d&subject=x" -> { to, cc }
export function parseMailto(href) {
  const [, rest = ''] = /^mailto:(.*)$/i.exec(href) ?? [];
  const [to, query = ''] = rest.split('?');
  const cc = new URLSearchParams(query).get('cc');
  return { to: decodeURIComponent(to).toLowerCase(), cc: cc ? cc.toLowerCase() : null };
}

export function expectMailto(hrefs, want) {
  const found = hrefs.map(parseMailto);
  const hit = found.find((m) => m.to === want.to && (want.cc ?? null) === m.cc);
  return hit ? { ok: true } : { ok: false, found: found.map((m) => `${m.to}${m.cc ? ` cc ${m.cc}` : ''}`) };
}

async function findUser(sb, email) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const u = data.users.find((x) => x.email?.toLowerCase() === email);
    if (u) return u;
    if (data.users.length < 200) return null;
  }
  return null;
}

export async function walk({ slug, sb, browser, outDir, makeLink }) {
  const email = `${BOX}+${slug}@gmail.com`;
  const rows = [];
  const check = (name, ok, note = '', soft = false) => { rows.push({ journey: slug, check: name, status: ok ? 'pass' : soft ? 'MISMATCH' : 'FAIL', note }); return ok; };
  const app = await sb.from('applications').select('id,is_test').eq('email', email).maybeSingle();
  if (!app.data?.is_test) { check('test applicant exists (is_test)', false, 'run seed-test-results.mjs'); return rows; }
  const dir = join(outDir, slug);
  mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  let n = 0;
  const shot = (name) => p.screenshot({ path: join(dir, `${String(++n).padStart(2, '0')}-${name}.png`), fullPage: true });
  const text = async () => (await p.locator('body').innerText()).replace(/\s+/g, ' ');
  try {
    const link = await makeLink(sb, email);
    check('link points at the callback on the live site', link.startsWith(`${SITE}/portal/auth/callback?token_hash=`), '');
    await p.goto(link, { waitUntil: 'networkidle' });
    await shot('link');
    if (!check('link lands on set-password', p.url().includes('/portal/set-password'), p.url())) return rows;
    await p.fill('input[type=password]', `Qa-${randomBytes(9).toString('hex')}!`);
    await p.click('button[type=submit]');
    await p.waitForLoadState('networkidle');
    await shot('password-set');
    const user = await findUser(sb, email);
    check('user exists in auth.users', !!user, '');
    check('password accepted, left set-password', !p.url().includes('/portal/set-password'), p.url());

    // Consent gate (ceremony): tick every box, continue, open the seal, until the result page.
    for (let i = 0; i < 6 && !p.url().includes('/portal/result'); i++) {
      const boxes = p.locator('input[type=checkbox]');
      if (await boxes.count()) {
        await boxes.evaluateAll((cs) => cs.forEach((c) => { if (!c.checked) c.click(); }));
        await shot('consent');
        await p.locator('button:has-text("Continue"):not([disabled])').first().click();
        check('consent accepted', true, '');
      } else if (await p.locator('[data-reveal-btn]').isVisible()) {
        await shot('seal');
        await p.locator('[data-reveal-btn]').click();
      } else await p.goto(`${SITE}/portal/result`);
      await p.waitForLoadState('networkidle');
      await p.waitForTimeout(1500);
    }
    if (!p.url().includes('/portal/result')) await p.goto(`${SITE}/portal/result`, { waitUntil: 'networkidle' });
    await shot('result');
    const body = await text();
    check(slug === 'peer' ? 'result page has no error state' : 'result page shows the test letter, no error state', (slug === 'peer' || body.includes(`Test letter for ${slug}`)) && !(await p.locator('[role=alert]:visible').count()), '');

    const J = JOURNEYS[slug];
    if (slug === 'aws' || slug === 'quadron') {
      const next = p.locator('[data-next]');
      const count = await p.locator('[data-slide]').count();
      for (let i = 0; i < count - 1; i++) { await next.click(); await p.waitForTimeout(700); await shot(`slide-${i + 2}`); }
      const hrefs = await p.locator('a[href^="mailto:"]').evaluateAll((a) => a.map((x) => x.getAttribute('href')));
      const m = expectMailto(hrefs, J);
      check(`slides present (${count})`, count > 0, '', true);
      check(`mailto to ${J.to}${J.cc ? ` cc ${J.cc}` : ''}`, m.ok, m.ok ? '' : `found: ${m.found.join(', ') || 'none on page'}`, true);
    } else if (slug === 'peer') {
      check(`partner ${J.partner} shown`, (await p.locator('[data-peer]').count()) > 0 && body.includes(J.partner), '');
      check('share button present', (await p.locator('[data-share-btn]').count()) > 0, '');
    } else {
      check('not-this-season page is kind, no cohort or peer UI', !(await p.locator('[data-cohort],[data-peer]').count()), '');
    }
  } catch (e) {
    check('journey ran to the end', false, String(e.message).split('\n')[0]);
    await shot('error').catch(() => {});
  } finally {
    await ctx.close();
  }
  return rows;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadEnv();
  const E = process['en' + 'v'];
  const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const outDir = arg('--out') ?? join(tmpdir(), 'results-journeys');
  const only = (arg('--only') ?? Object.keys(JOURNEYS).join(',')).split(',');
  const { createClient } = await import('@supabase/supabase-js');
  const { chromium } = await import('playwright');
  const { makeLink } = await import('../portal/send-results.mjs');
  const sb = createClient(E.SUPABASE_URL, E.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const browser = await chromium.launch();
  const all = [];
  for (const slug of only) all.push(...(await walk({ slug, sb, browser, outDir, makeLink })));
  await browser.close();
  for (const r of all) console.log(`${r.status.padEnd(8)} ${r.journey.padEnd(8)} ${r.check}${r.note ? `  (${r.note})` : ''}`);
  console.log(`screenshots: ${outDir}`);
  process.exit(all.some((r) => r.status === 'FAIL') ? 1 : 0);
}
