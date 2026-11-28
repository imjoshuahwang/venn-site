import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedDemo, createDemoSession, demoClientFor, getDemoSession, OUTCOMES, newDemoId } from './index.ts';

const sb = (id: string) => demoClientFor(id) as any;

test('seedDemo builds all seven outcomes, cohort fixtures carry seat_cap 20', () => {
  assert.deepEqual([...OUTCOMES], ['cohort-aws', 'cohort-quadron', 'cohort-both', 'peer', 'network_waitlist', 'track_waitlist', 'not_this_season']);
  for (const o of OUTCOMES) {
    const s = seedDemo(o, { minor: false });
    if (o.startsWith('cohort')) { assert.equal(s.result.outcome, 'cohort'); assert.equal(s.cohort?.seat_cap, o === 'cohort-quadron' ? 20 : 10); }
    else { assert.equal(s.cohort, null); assert.equal(s.result.outcome, o); }
  }
  assert.equal(seedDemo('cohort-quadron', { minor: false }).cohort?.slug, 'quadron');
});

test('auth accepts anything and no network is touched', async () => {
  const id = newDemoId(); createDemoSession(id, 'cohort-aws', { minor: false });
  const c = sb(id);
  const r = await c.auth.signInWithPassword({ email: 'x@y.z', password: 'nope' });
  assert.equal(r.error, null); assert.equal(r.data.user.email, 'x@y.z');
  assert.equal((await c.auth.getUser()).data.user.id, getDemoSession(id)!.user.id);
  assert.equal((await c.auth.verifyOtp({ token_hash: 'a', type: 'invite' })).error, null);
  assert.equal((await c.auth.updateUser({ password: 'abc' })).error, null);
  assert.equal((await c.auth.signOut()).error, null);
});

test('results table: thenable builder, select/eq/maybeSingle, embedded cohort', async () => {
  const id = newDemoId(); createDemoSession(id, 'cohort-aws', { minor: false });
  const r = await sb(id).from('results').select('*, cohort:cohorts(*)').eq('season', 'fall-2026').limit(1).maybeSingle();
  assert.equal(r.error, null); assert.equal(r.data.outcome, 'cohort'); assert.equal(r.data.cohort.seat_cap, 10);
  const none = await sb(id).from('results').select('*').eq('season', 'zzz').limit(1).maybeSingle();
  assert.equal(none.data, null);
  const list = await sb(id).from('results').select('outcome, letter').eq('status', 'approved');
  assert.equal(list.data.length, 1);
});

test('state persists within a session and is isolated between sessions', async () => {
  const a = newDemoId(), b = newDemoId();
  createDemoSession(a, 'cohort-aws', { minor: false }); createDemoSession(b, 'cohort-aws', { minor: false });
  const res = (await sb(a).from('results').select('*').limit(1).maybeSingle()).data;
  assert.equal((await sb(a).rpc('sign_mou', { p_result_id: res.id, p_typed_name: 'Ana', p_agreed: true })).error, null);
  const sigA = await sb(a).from('mou_signatures').select('*').eq('result_id', res.id).limit(1).maybeSingle();
  assert.equal(sigA.data.typed_name, 'Ana');
  const sigB = await sb(b).from('mou_signatures').select('*').eq('result_id', res.id).limit(1).maybeSingle();
  assert.equal(sigB.data, null);
});

test('peer flow: down reveals email only once both are down', async () => {
  const id = newDemoId(); createDemoSession(id, 'peer', { minor: false });
  const before = (await sb(id).rpc('get_my_peer', { p_season: 'fall-2026' })).data[0];
  assert.equal(before.i_am_down, false); assert.equal(before.partner_email, null);
  const after = (await sb(id).rpc('peer_down', { p_match_id: before.match_id })).data[0];
  assert.equal(after.i_am_down, true); assert.equal(after.they_are_down, true); assert.ok(after.partner_email);
  assert.equal((await sb(id).rpc('get_my_peer')).data[0].partner_email, after.partner_email);
});

test('onboarding, consent, team, phone, guiding, minor and parent RPCs', async () => {
  const id = newDemoId(); createDemoSession(id, 'cohort-aws', { minor: true });
  const c = sb(id);
  assert.equal((await c.rpc('get_onboarding')).data.minor, true);
  await c.rpc('start_onboarding'); await c.rpc('save_onboarding_profile', { p_name: 'Maya Okafor', p_location: 'OH', p_birthday: '2011-05-01' });
  const ob = (await c.rpc('get_onboarding')).data;
  assert.equal(ob.profile_done, true); assert.equal(ob.name, 'Maya Okafor');
  assert.equal((await c.rpc('get_my_first_name')).data, 'Maya Okafor');
  assert.equal((await c.rpc('consent_state', { p_version: 'v1' })).data.done, false);
  await c.rpc('give_consent', { clauses: { a: true }, version: 'v1' });
  assert.equal((await c.rpc('consent_state', { p_version: 'v1' })).data.done, true);
  assert.equal((await c.rpc('save_phone', { p_phone: '1', p_whatsapp: false })).data, 'VENN-4F2K');
  await c.rpc('add_team_member', { p_email: 'sam@example.com' });
  const team = (await c.rpc('get_my_team')).data; assert.equal(team.length, 2);
  await c.rpc('remove_team_member', { p_member_id: team.find((t: any) => t.member_id).member_id });
  assert.equal((await c.rpc('get_my_team')).data.length, 1);
  assert.equal((await c.rpc('portal_is_lead', { p_result_id: 1 })).data, true);
  assert.equal(typeof (await c.rpc('cohort_org_count', { p_result_id: 1 })).data, 'number');
  const res = (await c.from('results').select('*').limit(1).maybeSingle()).data;
  await c.rpc('save_guiding_answers', { p_result_id: res.id, p_answers: { goal: 'x' } });
  assert.deepEqual((await c.from('guiding_answers').select('question, answer').eq('result_id', res.id)).data, [{ question: 'goal', answer: 'x', result_id: res.id }]);
  assert.equal((await c.rpc('minor_mou_state')).data.minor, true);
  await c.rpc('minor_mou_sign', { p_role: 'minor', p_png: 'p', p_parent_name: null });
  await c.rpc('minor_mou_sign', { p_role: 'parent', p_png: 'p', p_parent_name: 'Ana' });
  await c.rpc('minor_mou_confirm');
  const m = (await c.rpc('minor_mou_state')).data; assert.equal(m.confirmed, true); assert.equal(m.parent_name, 'Ana');
  const tok = (await c.rpc('request_parent_consent', { p_user_id: 'u', p_parent_email: 'p@e.co' })).data;
  assert.equal((await c.rpc('parent_consent_state', { p_token: tok })).data, 'ok');
  await c.rpc('sign_parent_consent', { p_token: tok });
  assert.equal((await c.rpc('parent_consent_state', { p_token: tok })).data, 'used');
  assert.ok((await c.rpc('parent_consent_context', { p_token: tok })).data[0].first_name);
});

test('generic RPCs: rate limit, links, funnel, viewed, ceremony, match mail, refer', async () => {
  const id = newDemoId(); createDemoSession(id, 'cohort-aws', { minor: false });
  const c = sb(id);
  assert.equal((await c.rpc('portal_rate_hit', { p_key: 'k', p_window_seconds: 60 })).data, 0);
  assert.equal((await c.rpc('portal_link_live', { p_token_hash: 'h' })).data, true);
  for (const n of ['portal_consume_link', 'portal_event', 'match_mail_done', 'record_step', 'submit_share']) assert.equal((await c.rpc(n, {})).error, null);
  assert.equal((await c.rpc('match_mail_target', {})).data, null);
  assert.equal((await c.rpc('referral_status', { code: 'x' })).error, null);
  await c.rpc('mark_viewed', { p_result_id: 1 }); await c.rpc('finish_ceremony', { p_result_id: 1 });
  const r = (await c.from('results').select('*').limit(1).maybeSingle()).data;
  assert.ok(r.viewed_at); assert.ok(r.ceremony_done_at);
  assert.match((await c.rpc('nope_unknown')).error.message, /nope_unknown/);
});

test('dual acceptance exposes both cohorts, others keep the single shape', () => {
  const b = seedDemo('cohort-both', { minor: false });
  assert.deepEqual(b.result.cohorts.map((c: any) => [c.slug, c.seat_cap]), [['aws', 10], ['quadron', 20]]);
  assert.equal(seedDemo('cohort-aws', { minor: false }).result.cohorts, undefined);
});
