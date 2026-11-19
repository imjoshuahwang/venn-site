import test from 'node:test';
import assert from 'node:assert/strict';
import { teamView, TEAM_MAX } from './team.ts';
import { getMyTeam, addTeamMember, removeTeamMember } from './api.ts';

const row = (o: object) => ({ member_id: 1, email: 'a@x.org', state: 'invited', is_me: false, lead_is_me: true, ...o });

test('teamView: empty, seats left, full, state words', () => {
  assert.equal(teamView([]).members.length, 0);
  const v = teamView([row({}), row({ member_id: 2, state: 'waiting on parent' })] as any);
  assert.equal(v.canAdd, true); assert.equal(v.canRemove, true);
  assert.equal(v.members[1].label, 'waiting on parent');
  const full = teamView([1, 2, 3].map((n) => row({ member_id: n })) as any);
  assert.equal(full.canAdd, false); assert.equal(TEAM_MAX, 3);
  assert.equal(teamView([row({ lead_is_me: false })] as any).canAdd, false);
  // a lead with zero members arrives as one null-member row and can still add
  const zero = teamView([row({ member_id: null, email: null, state: null })] as any);
  assert.equal(zero.members.length, 0); assert.equal(zero.canAdd, true); assert.equal(zero.canRemove, true);
});

function stub(res: { data: unknown; error: unknown }) {
  const calls: any[] = [];
  return { calls, sb: { rpc: async (fn: string, args: unknown) => (calls.push({ fn, args }), res) } as any };
}

test('wrappers map args and surface errors', async () => {
  const a = stub({ data: [row({})], error: null });
  assert.equal((await getMyTeam(a.sb)).data?.length, 1);
  assert.equal(a.calls[0].fn, 'get_my_team');
  const b = stub({ data: null, error: { message: 'team full', code: '23514' } });
  assert.deepEqual(await addTeamMember(b.sb, 'a@x.org'), { data: null, error: { message: 'team full', code: '23514' } });
  assert.deepEqual(b.calls[0], { fn: 'add_team_member', args: { p_email: 'a@x.org' } });
  const c = stub({ data: '2026-11-18T00:00:00Z', error: null });
  await removeTeamMember(c.sb, 4);
  assert.deepEqual(c.calls[0], { fn: 'remove_team_member', args: { p_member_id: 4 } });
});
