// #314: every dev route 404s outside DEV, and every gallery link resolves to a route.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GALLERY, EMAILS } from './dev-fixtures.ts';
import { isPublicPortalPath } from './host.ts';

const pages = new URL('../../pages/', import.meta.url).pathname;
const devDir = join(pages, 'portal/dev');
const GUARD = 'if (!import.meta.env.DEV) return new Response(null, { status: 404 });';
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

test('every file under /portal/dev 404s outside DEV before rendering', () => {
  for (const f of walk(devDir)) {
    const src = readFileSync(f, 'utf8');
    const at = src.indexOf(GUARD);
    assert.ok(at > 0, `${f} has no DEV 404 guard`);
    if (f.endsWith('.astro')) assert.ok(at < src.indexOf('---', 3), `${f}: guard must sit in the frontmatter`);
    else for (const m of src.matchAll(/export const (GET|POST)\b[^\n]*\n([^\n]*)/g)) assert.ok(m[2].includes(GUARD), `${f}: ${m[1]} must start with the guard`);
  }
});

test('/portal/dev and below need no session', () => {
  assert.ok(isPublicPortalPath('/portal/dev'));
  assert.ok(isPublicPortalPath('/portal/dev/email/invite'));
  assert.ok(!isPublicPortalPath('/portal/devx'));
});

// A static route file, or a dynamic [param] sibling, must exist for each path.
function routeExists(path: string): boolean {
  const parts = path.replace(/^\//, '').split('/').filter(Boolean);
  const go = (dir: string, i: number): boolean => {
    if (i === parts.length) return ['index.astro', 'index.ts'].some((f) => existsSync(join(dir, f)));
    const last = i === parts.length - 1;
    if (last && ['.astro', '.ts'].some((e) => existsSync(join(dir, parts[i] + e)))) return true;
    if (existsSync(join(dir, parts[i])) && statSync(join(dir, parts[i])).isDirectory() && go(join(dir, parts[i]), i + 1)) return true;
    return readdirSync(dir).some((f) => /^\[\w+\]/.test(f) && (last ? /\.(astro|ts)$/.test(f) : statSync(join(dir, f)).isDirectory() && go(join(dir, f), i + 1)));
  };
  return go(pages, 0);
}

test('every gallery href points to a route that exists', () => {
  assert.ok(GALLERY.length > 40);
  for (const [label, href] of GALLERY) assert.ok(routeExists(href.split('?')[0]), `${label}: ${href}`);
});

test('every email in the gallery has a renderer', () => {
  const src = readFileSync(join(devDir, 'email/[name].ts'), 'utf8');
  for (const e of EMAILS) assert.ok(e.startsWith('match-') || src.includes(`'${e}'`) || src.includes(` ${e}:`), e);
});
