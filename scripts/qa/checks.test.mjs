import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { serveFixtures } from './fixtures.mjs';
import { runChecks, scrollFullPage, prepare, CHECK_NAMES } from './checks.mjs';
import { contextOptions } from './devices.mjs';

let srv, browser;
before(async () => {
  srv = await serveFixtures();
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); await srv?.close(); });

async function audit(path) {
  const ctx = await browser.newContext(contextOptions({ name: 'iPhone 15' }));
  try {
    const page = await ctx.newPage();
    const state = await prepare(page);
    await page.goto(srv.base + path, { waitUntil: 'load' });
    await scrollFullPage(page);
    await page.waitForTimeout(path === '/cls' ? 2200 : 1200); // layout-shift entries arrive late in emulated mobile
    return await runChecks(page, state);
  } finally { await ctx.close(); }
}

test('every check name is reported once', async () => {
  const rows = await audit('/clean');
  assert.deepEqual(rows.map((r) => r.check), CHECK_NAMES);
});

test('clean page passes all checks', async () => {
  const rows = await audit('/clean');
  assert.deepEqual(rows.filter((r) => !r.pass), []);
});

const bad = { '/overflow': 'overflow', '/offscreen': 'offscreen', '/overlap': 'overlap', '/tap': 'tap', '/text': 'text', '/console': 'console', '/cls': 'cls', '/img': 'img' };
for (const [path, check] of Object.entries(bad)) {
  test(`${path} fails exactly ${check}`, async () => {
    const rows = await audit(path);
    const failed = rows.filter((r) => !r.pass);
    assert.deepEqual(failed.map((r) => r.check), [check], JSON.stringify(failed));
    assert.ok(failed[0].details.length > 0, 'failure carries details');
  });
}

test('overflow names the widest offender', async () => {
  const [row] = (await audit('/overflow')).filter((r) => r.check === 'overflow');
  assert.match(row.details, /div/);
  assert.match(row.details, /right=61\d/);
});

test('hidden honeypots and inline links in prose are not tap failures', async () => {
  const rows = await audit('/tap-exempt');
  assert.deepEqual(rows.filter((r) => !r.pass), []);
});

test('a small link standing alone in a list still fails tap', async () => {
  const rows = await audit('/tap-list');
  assert.deepEqual(rows.filter((r) => !r.pass).map((r) => r.check), ['tap']);
});

test('closed details content does not overlap its siblings', async () => {
  const rows = await audit('/details-closed');
  assert.deepEqual(rows.filter((r) => !r.pass), []);
});

test('scrollFullPage returns settled at the top even with smooth scrolling', async () => {
  const ctx = await browser.newContext(contextOptions({ name: 'iPhone 15' }));
  try {
    const page = await ctx.newPage();
    const state = await prepare(page);
    await page.goto(srv.base + '/smooth-fixed', { waitUntil: 'load' });
    await scrollFullPage(page);
    assert.equal(await page.evaluate(() => scrollY), 0);
    const rows = await runChecks(page, state); // no settle wait: must already be stable
    assert.deepEqual(rows.filter((r) => !r.pass), []);
  } finally { await ctx.close(); }
});

test('content under a fully transparent ancestor is not visible, so stacked crossfade cards do not overlap', async () => {
  const rows = await audit('/faded-stack');
  assert.deepEqual(rows.filter((r) => !r.pass), []);
});
