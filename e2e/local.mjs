// Shared e2e helpers, LOCAL stack only. #123 can import these.
import assert from 'node:assert/strict';

/** Clears #130's rate-limit counters so repeated logins from one IP do not trip the 5-per-window limit. Refuses a non-local URL. */
export async function clearRateLimits(admin, apiUrl) {
  assert.match(apiUrl, /^https?:\/\/(127\.0\.0\.1|localhost)[:/]/, 'refusing to clear rate limits on a non-local stack');
  const { error } = await admin.from('portal_rate_hits').delete().gte('id', 0);
  assert.ifError(error);
}

/** Logs in through the form once Turnstile has issued its token, then waits for the landing URL. */
export async function portalLogin(page, base, email, password, landing) {
  await page.goto(`${base}/portal/login`);
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', password);
  await page.waitForFunction(() => document.querySelector('input[name="cf-turnstile-response"]')?.value);
  await page.click('button[type=submit]');
  await page.waitForURL(landing);
}
