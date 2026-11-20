import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shareUrl } from './share-card.ts';

// The shared URL is the public site root (index.astro on Base.astro), which must carry the OG tags.
const base = readFileSync(new URL('../../layouts/Base.astro', import.meta.url), 'utf8');
const index = readFileSync(new URL('../../pages/index.astro', import.meta.url), 'utf8');

test('shared url target renders through Base with og title, description and image', () => {
  assert.equal(new URL(shareUrl()).pathname, '/');
  assert.match(index, /layouts\/Base\.astro/);
  for (const tag of ['og:title', 'og:description', 'og:image"']) assert.ok(base.includes(`property="${tag.replace(/"$/, '')}"`), tag);
});
