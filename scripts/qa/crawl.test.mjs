import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serveFixtures } from './fixtures.mjs';
import { crawlSitemap, parsePages, filterOnly } from './crawl.mjs';
import { parseCli } from './cli.mjs';
import { resolveDevices } from './devices.mjs';

let srv;
before(async () => { srv = await serveFixtures(); });
after(async () => { await srv.close(); });

test('crawl follows the sitemap index and rewrites hosts to the base', async () => {
  assert.deepEqual(await crawlSitemap(srv.base), ['/', '/clean', '/tap']);
});

test('crawl falls back to / when there is no sitemap', async () => {
  assert.deepEqual(await crawlSitemap('http://127.0.0.1:1'), ['/']);
});

test('--pages accepts paths and full URLs; --only filters by substring', () => {
  assert.deepEqual(parsePages('/, /apply,https://x.org/a?b=1', 'http://h'), ['/', '/apply', '/a?b=1']);
  assert.deepEqual(filterOnly(['/', '/apply', '/about'], 'app'), ['/apply']);
});

test('cli: defaults, overrides, and mode flags from the registry', () => {
  const d = parseCli([], {});
  assert.equal(d.base, 'http://127.0.0.1:4321');
  assert.equal(d.workers, 4);
  const mode = { contextOptions: { offline: false } };
  const c = parseCli(['https://x.org/', '--pages', '/,/apply', '--workers', '2', '--slow'], { slow: mode });
  assert.equal(c.base, 'https://x.org');
  assert.deepEqual(c.pages, ['/', '/apply']);
  assert.equal(c.workers, 2);
  assert.deepEqual(c.activeModes, [mode]);
});

test('device matrix: 8 entries, browser filter and exact-name override', () => {
  assert.equal(resolveDevices().length, 8);
  assert.deepEqual(resolveDevices({ browsers: ['chromium'] }).map((d) => d.name), ['Pixel 7', 'Galaxy S9+', 'Pixel 7 landscape']);
  assert.deepEqual(resolveDevices({ names: ['iphone se'] }).map((d) => d.name), ['iPhone SE']);
  assert.throws(() => resolveDevices({ names: ['Nokia'] }), /unknown device/);
});
