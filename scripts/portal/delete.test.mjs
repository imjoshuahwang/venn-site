import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { emailKey, parseArgs, buildPlan, formatPlan, TABLES } from './delete.mjs';

const SRC = new URL('./delete.mjs', import.meta.url);
const UID = 'u-1';
const DATA = {
  applications: [{ id: 1, email: 'A.b+x@gmail.com', email_key: 'ab@gmail.com' }, { id: 2, email: 'other@x.org', email_key: 'other@x.org' }],
  results: [{ id: 10, application_id: 1 }, { id: 11, application_id: 2 }],
  peer_matches: [{ id: 20, result_a: 10, result_b: 11 }, { id: 21, result_a: 98, result_b: 99 }],
  mou_signatures: [{ id: 30, result_id: 10, user_id: UID }],
  consents: [{ id: 40, user_id: UID }],
  parent_consents: [],
  team_members: [{ id: 50, lead_result_id: 10, email_key: 'z@x.org', user_id: null }, { id: 51, lead_result_id: 99, email_key: 'ab@gmail.com', user_id: UID }],
  guiding_answers: [{ id: 60, result_id: 10 }],
  portal_links: [{ id: 70, user_id: UID }],
  rs_events: [{ id: 80, email: 'a.b@gmail.com' }],
  match_pool: [{ result_id: 10 }, { result_id: 99 }],
  matches: [{ id: 90, requester_result_id: 10, peer_result_id: 99 }, { id: 91, requester_result_id: 98, peer_result_id: 99 }],
  match_events: [{ id: 95, match_id: 90 }, { id: 96, match_id: 91 }],
  match_blocks: [{ peer_result_id: 99, application_id: 1 }, { peer_result_id: 99, application_id: 2 }],
};

// Stub client: reads work, any write-shaped call throws.
function stub() {
  const boom = (n) => () => { throw new Error('write reached: ' + n); };
  return {
    from(table) {
      let rows = DATA[table] ?? [];
      const q = {
        select: () => q,
        eq: (c, v) => { rows = rows.filter((r) => r[c] === v); return q; },
        in: (c, vs) => { rows = rows.filter((r) => vs.includes(r[c])); return q; },
        then: (res) => res({ data: rows, error: null }),
        insert: boom('insert'), update: boom('update'), upsert: boom('upsert'), delete: boom('delete'),
      };
      return q;
    },
    rpc: boom('rpc'),
    auth: { admin: {
      listUsers: async () => ({ data: { users: [{ id: UID, email: 'a.b@gmail.com' }, { id: 'u-2', email: 'q@x.org' }] }, error: null }),
      deleteUser: boom('deleteUser'), updateUserById: boom('updateUserById'), createUser: boom('createUser'),
    } },
  };
}

const code = () => fs.readFileSync(SRC, 'utf8').replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, '');

test('emailKey mirrors public.email_key', () => {
  assert.equal(emailKey(' A.b+x@Gmail.com '), 'ab@gmail.com');
  assert.equal(emailKey('Foo+t@School.org'), 'foo@school.org');
});

test('refuses without --email and has no --execute', () => {
  assert.throws(() => parseArgs([]), /--email/);
  assert.throws(() => parseArgs(['--email']), /--email/);
  assert.throws(() => parseArgs(['--email', 'a@b.co', '--execute']), /unknown/i);
  assert.equal(parseArgs(['--email', 'a@b.co']).email, 'a@b.co');
  const r = spawnSync('node', [SRC.pathname], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /--email/);
  assert.ok(!/execute/i.test(code()));
});

test('plan covers every table, with ids and zero counts', async () => {
  const plan = await buildPlan(stub(), 'a.b@gmail.com');
  assert.deepEqual(Object.keys(plan.tables), TABLES);
  for (const t of ['applications', 'results', 'peer_matches', 'mou_signatures', 'consents', 'parent_consents', 'team_members', 'guiding_answers', 'portal_links', 'auth.users', 'rs_events', 'match_pool', 'matches', 'match_events', 'match_blocks']) assert.ok(t in plan.tables, t);
  assert.ok(!('apply_events' in plan.tables));
  assert.deepEqual(plan.tables.applications, [1]);
  assert.deepEqual(plan.tables.results, [10]);
  assert.deepEqual(plan.tables.peer_matches, [20]);
  assert.deepEqual(plan.tables.mou_signatures, [30]);
  assert.deepEqual(plan.tables.consents, [40]);
  assert.deepEqual(plan.tables.parent_consents, []);
  assert.deepEqual([...plan.tables.team_members].sort(), [50, 51]);
  assert.deepEqual(plan.tables.guiding_answers, [60]);
  assert.deepEqual(plan.tables.portal_links, [70]);
  assert.deepEqual(plan.tables['auth.users'], [UID]);
  assert.deepEqual(plan.tables.rs_events, [80]);
  assert.deepEqual(plan.tables.match_pool, [10]);
  assert.deepEqual(plan.tables.matches, [90]);
  assert.deepEqual(plan.tables.match_events, [95]);
  assert.deepEqual(plan.tables.match_blocks, [99]);
  const out = formatPlan(plan);
  assert.match(out, /applications\s+1\b/);
  assert.match(out, /parent_consents\s+0\b/);
  assert.match(out, /rs_events.*#136/);
  assert.match(out, /dry run/i);
});

test('unknown person yields an all-zero plan', async () => {
  const plan = await buildPlan(stub(), 'nobody@x.org');
  for (const ids of Object.values(plan.tables)) assert.deepEqual(ids, []);
});

test('portal layout carries the deletion mailto line', () => {
  const layout = fs.readFileSync(new URL('../../src/layouts/Portal.astro', import.meta.url), 'utf8');
  assert.match(layout, /Want your data deleted\? <a href="mailto:contact@joinvenn\.org">Email contact@joinvenn\.org<\/a>/);
});

test('module source has no write calls', () => {
  const src = code();
  assert.ok(!/\.(insert|update|upsert|delete|rpc|deleteUser|updateUserById|createUser|inviteUserByEmail)\s*\(/.test(src));
  assert.ok(!/\b(DELETE|UPDATE|INSERT)\b/.test(src));
});
