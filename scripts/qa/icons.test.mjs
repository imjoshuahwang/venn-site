// Favicon set (#233): files, dimensions, and both layouts use the shared Icons partial.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';

const root = new URL('../../', import.meta.url).pathname;
const sizes = { 'favicon-32.png': 32, 'icon-192.png': 192, 'icon-512.png': 512, 'apple-touch-icon.png': 180 };

for (const [file, size] of Object.entries(sizes)) {
  test(`${file} is ${size}x${size}`, async () => {
    const m = await sharp(root + 'public/' + file).metadata();
    assert.equal(m.format, 'png');
    assert.equal(m.width, size);
    assert.equal(m.height, size);
  });
}

test('favicon.svg is an svg', () => {
  assert.match(readFileSync(root + 'public/favicon.svg', 'utf8'), /<svg[\s>]/);
});

test('Icons partial links svg, 32 png, apple-touch, 192/512 and manifest', () => {
  const src = readFileSync(root + 'src/components/Icons.astro', 'utf8');
  for (const href of ['/favicon.svg', '/favicon-32.png', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/site.webmanifest']) {
    assert.ok(src.includes(`href="${href}"`), href);
  }
  assert.match(src, /rel="apple-touch-icon"/);
});

for (const layout of ['Base', 'Portal']) {
  test(`${layout} layout renders Icons`, () => {
    const src = readFileSync(root + `src/layouts/${layout}.astro`, 'utf8');
    assert.match(src, /import Icons from '..\/components\/Icons\.astro'/);
    assert.match(src, /<Icons \/>/);
  });
}
