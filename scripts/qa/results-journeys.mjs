// Walks the four results journeys on PROD at phone (390x844) and tablet (820x1180) width, as the fictional is_test applicants (#192). Usage: npm run qa:results [-- --out DIR] [--only aws,quadron] [--device phone|tablet]
// Each journey: action link (same generateLink + redirect the email uses) -> set password -> user in auth.users -> consent -> result -> slides -> mailto -> fresh-context sign-in with that password.
// Content in the slides/mailto area belongs to other builders, so a mismatch there is reported as MISMATCH, not a failure. Auth, link and routing problems FAIL.
// Run after `node scripts/portal/seed-test-results.mjs`. Never touches a non-test row: it refuses any email whose application is not is_test.
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadEnv } from '../portal/env.mjs';
import { overflow, offscreen, tapTargets } from './checks.mjs';

export const SITE = 'https://joinvenn.org';
export const BOX = 'imjoshuahwang';
export const CONTACT = 'contact@joinvenn.org';
export const DEVICES = {
  phone: { width: 390, height: 844, isMobile: true },
  tablet: { width: 820, height: 1180, isMobile: true },
};
// A primary button must sit fully inside the viewport and, on a phone, in the lower 60% where a thumb reaches.
export function reachOk(box, vp, thumbOnly) {
  if (!box) return { ok: false, why: 'not found' };
  if (box.x < 0 || box.x + box.width > vp.width) return { ok: false, why: 'off the sides' };
  if (box.y < 0 || box.y + box.height > vp.height) return { ok: false, why: `outside the viewport (y ${Math.round(box.y)}-${Math.round(box.y + box.height)} of ${vp.height})` };
  if (thumbOnly && box.y + box.height / 2 < vp.height * 0.4) return { ok: false, why: `above thumb reach (centre y ${Math.round(box.y + box.height / 2)} of ${vp.height})` };
  return { ok: true };
}

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

// Login allows 5 tries per IP and per email in 15 minutes (src/lib/portal/ratelimit.ts), and one full run signs in 8 times from one IP.
// The IP Vercel sees is not knowable from here, so the walker learns its own IP row as the one written just before its email row
// (checkLimits writes ip, then email, in one request) and clears only those two. Same hashing as ratelimit.ts.
export const rateKey = (s) => createHash('sha256').update(s).digest('hex').slice(0, 32);
export const RATE_MESSAGE = 'Too many tries.';
export function pairedIpRow(emailRow, prevRow) {
  if (!emailRow || !prevRow) return null;
  return Math.abs(new Date(emailRow.hit_at) - new Date(prevRow.hit_at)) < 2000 ? prevRow.key : null;
}
async function clearOwnLoginHits(sb, email) {
  const mine = rateKey(`login:email:${email}`);
  const { data: [row] = [] } = await sb.from('portal_rate_hits').select('id,hit_at').eq('key', mine).order('id', { ascending: false }).limit(1);
  const { data: [prev] = [] } = row ? await sb.from('portal_rate_hits').select('key,hit_at').lt('id', row.id).order('id', { ascending: false }).limit(1) : { data: [] };
  const ip = pairedIpRow(row, prev);
  await sb.from('portal_rate_hits').delete().in('key', ip ? [mine, ip] : [mine]);
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

export async function walk({ slug, sb, browser, outDir, makeLink, device = 'phone' }) {
  const dev = DEVICES[device];
  const vp = { width: dev.width, height: dev.height };
  const email = `${BOX}+${slug}@gmail.com`;
  const rows = [];
  const check = (name, ok, note = '', soft = false) => { rows.push({ journey: slug, device, check: name, status: ok ? 'pass' : soft ? 'MISMATCH' : 'FAIL', note }); return ok; };
  const app = await sb.from('applications').select('id,is_test').eq('email', email).maybeSingle();
  if (!app.data?.is_test) { check('test applicant exists (is_test)', false, 'run seed-test-results.mjs'); return rows; }
  const dir = join(outDir, device, slug);
  mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: dev.isMobile, hasTouch: true });
  const p = await ctx.newPage();
  let n = 0;
  const issues = [];
  // Layout checks at every step, plus where the primary button sits while the page is still at the top.
  const audit = async (name, primary, thumb = false) => {
    for (const fn of [overflow, offscreen, tapTargets]) {
      const r = await fn(p);
      if (!r.pass) issues.push(`${name}: ${r.check} ${r.details}`);
    }
    if (primary) {
      const loc = p.locator(primary).first();
      const seen = (await loc.count()) && (await loc.isVisible());
      if (seen) await loc.scrollIntoViewIfNeeded();
      const box = seen ? await loc.boundingBox() : null;
      const r = reachOk(box, vp, thumb && device === 'phone');
      if (!r.ok) issues.push(`${name}: ${primary} ${r.why}`);
    }
  };
  const shot = (name) => p.screenshot({ path: join(dir, `${String(++n).padStart(2, '0')}-${name}.png`), fullPage: true });
  const text = async () => (await p.locator('body').innerText()).replace(/\s+/g, ' ');
  try {
    const link = await makeLink(sb, email);
    check('link points at the callback on the live site', link.startsWith(`${SITE}/portal/auth/callback?token_hash=`), '');
    await p.goto(link, { waitUntil: 'networkidle' });
    await audit('link');
    await shot('link');
    if (!check('link lands on set-password', p.url().includes('/portal/set-password'), p.url())) return rows;
    await audit('set-password', 'button[type=submit]');
    const pw = `Qa-${randomBytes(9).toString('hex')}!`;
    await p.fill('input[type=password]', pw);
    await p.click('button[type=submit]');
    await p.waitForLoadState('networkidle');
    await shot('password-set');
    const user = await findUser(sb, email);
    check('user exists in auth.users', !!user, '');
    check('password accepted, left set-password', !p.url().includes('/portal/set-password'), p.url());

    // Consent gate (ceremony): tick every box, continue, open the seal, until the result page.
    for (let i = 0; i < 6 && !p.url().includes('/portal/result'); i++) {
      const boxes = p.locator('input[type=checkbox]');
      if ((await boxes.count()) && (await p.locator('button:has-text("Continue"):not([disabled])').count())) {
        await boxes.evaluateAll((cs) => cs.forEach((c) => { if (!c.checked) c.click(); }));
        await audit('consent', 'button:has-text("Continue")', true);
        await shot('consent');
        await p.locator('button:has-text("Continue"):not([disabled])').first().click();
        check('consent accepted', true, '');
      } else if (await p.locator('[data-reveal-btn]').isVisible()) {
        await audit('seal', '[data-reveal-btn]');
        await shot('seal');
        await p.locator('[data-reveal-btn]').click();
      } else await p.goto(`${SITE}/portal/result`);
      await p.waitForLoadState('networkidle');
      await p.waitForTimeout(1500);
    }
    if (!p.url().includes('/portal/result')) await p.goto(`${SITE}/portal/result`, { waitUntil: 'networkidle' });
    await audit('result', slug === 'aws' || slug === 'quadron' ? '[data-next]' : null);
    await shot('result');
    const body = await text();
    check(slug === 'peer' ? 'result page has no error state' : 'result page shows the test letter, no error state', (slug === 'peer' || body.includes(`Test letter for ${slug}`)) && !(await p.locator('[role=alert]:visible').count()), '');

    const J = JOURNEYS[slug];
    if (slug === 'aws' || slug === 'quadron') {
      const next = p.locator('[data-next]');
      const count = await p.locator('[data-slide]').count();
      for (let i = 0; i < count - 1; i++) { await next.click(); await p.waitForTimeout(700); await audit(`slide-${i + 2}`, i + 2 < count ? '[data-next]' : null); await shot(`slide-${i + 2}`); }
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

    // Fresh device, password just set: sign-in must leave /portal/login with an HttpOnly session. A concurrent run on the same slug
    // resets the password and signs out other sessions, so this fails if two walkers overlap; run one at a time.
    const signIn = async () => {
      const lctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: dev.isMobile, hasTouch: true });
      const lp = await lctx.newPage();
      await lp.goto(`${SITE}/portal/login`, { waitUntil: 'networkidle' });
      await lp.fill('input[name=email]', email);
      await lp.fill('input[name=password]', pw);
      await lp.click('button[type=submit]');
      await lp.waitForLoadState('networkidle');
      return { lctx, lp, err: (await lp.locator('[role=alert]:visible').allInnerTexts()).join(' ') };
    };
    let attempt = await signIn();
    // Our own earlier sign-ins tripped the limit: clear the walker's two rows (that attempt wrote the IP row we learn) and try once more.
    if (attempt.err.includes(RATE_MESSAGE)) { await attempt.lctx.close(); await clearOwnLoginHits(sb, email); attempt = await signIn(); }
    const { lctx, lp, err } = attempt;
    try {
      await lp.screenshot({ path: join(dir, `${String(++n).padStart(2, '0')}-login.png`), fullPage: true });
      const path = new URL(lp.url()).pathname;
      check('fresh sign-in with the new password leaves /portal/login', path.startsWith('/portal') && path !== '/portal/login', `${path}${err ? ` "${err}"` : ''}`);
      const sess = (await lctx.cookies()).filter((c) => /^sb-.*-auth-token/.test(c.name));
      check('session cookie is HttpOnly and Secure', sess.length > 0 && sess.every((c) => c.httpOnly && c.secure), sess.map((c) => c.name).join(', ') || 'none');
    } finally { await lctx.close(); }
  } catch (e) {
    check('journey ran to the end', false, String(e.message).split('\n')[0]);
    await shot('error').catch(() => {});
  } finally {
    if (!rows.some((r) => r.check === 'journey ran to the end')) check(`layout clean at ${vp.width}px (overflow, off-screen, tap targets, thumb reach)`, issues.length === 0, [...new Set(issues)].slice(0, 6).join(' | '));
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
  const devices = (arg('--device') ?? Object.keys(DEVICES).join(',')).split(',');
  const { createClient } = await import('@supabase/supabase-js');
  const { chromium } = await import('playwright');
  const { makeLink } = await import('../portal/send-results.mjs');
  const sb = createClient(E.SUPABASE_URL, E.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const browser = await chromium.launch();
  const all = [];
  for (const device of devices) for (const slug of only) all.push(...(await walk({ slug, sb, browser, outDir, makeLink, device })));
  await browser.close();
  for (const r of all) console.log(`${r.status.padEnd(8)} ${r.device.padEnd(6)} ${r.journey.padEnd(8)} ${r.check}${r.note ? `  (${r.note})` : ''}`);
  console.log(`screenshots: ${outDir}`);
  process.exit(all.some((r) => r.status === 'FAIL') ? 1 : 0);
}
