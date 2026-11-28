// In-memory fake Supabase client for demo mode. Pure data, no network, no imports beyond types.
export const OUTCOMES = ['cohort-aws', 'cohort-quadron', 'cohort-both', 'peer', 'network_waitlist', 'track_waitlist', 'not_this_season'] as const;
export type DemoOutcome = (typeof OUTCOMES)[number];

type Row = Record<string, any>;
export type DemoState = {
  id: string; user: { id: string; email: string }; minor: boolean; season: string;
  result: Row; cohort: Row | null; mou: Row | null; guiding: Row[]; team: Row[]; nextMember: number;
  peer: { match_id: number; i_am_down: boolean; they_are_down: boolean };
  onboarding: { started: boolean; profile_done: boolean; contact_done: boolean; mou_done: boolean; name: string; org: string };
  consent: { done: boolean; answers: Record<string, boolean> };
  minorMou: { minor_signed: boolean; parent_signed: boolean; parent_link_signed: boolean; parent_name: string | null; confirmed: boolean };
  phoneCode: string | null; parentTokens: Map<string, 'ok' | 'used'>; events: Set<string>;
};

const g = globalThis as { __vennDemo?: Map<string, DemoState> };
const store = (): Map<string, DemoState> => (g.__vennDemo ??= new Map());
const now = () => new Date().toISOString();
export const newDemoId = (): string => `demo-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;

const LETTER = (o: string) => `Dear Applicant,\n\nThank you for applying this Season. This is the demo letter for ${o}.\n\nThe Venn team`;

export function seedDemo(outcome: DemoOutcome, opts: { minor: boolean }, id = newDemoId()): DemoState {
  const slug: 'aws' | 'quadron' = outcome === 'cohort-quadron' ? 'quadron' : 'aws';
  const isCohort = outcome.startsWith('cohort');
  const mk = (sl: 'aws' | 'quadron') => ({ id: sl === 'aws' ? 1 : 2, slug: sl, name: `${sl === 'aws' ? 'AWS' : 'Quadron'} Fall Cohort 2026`, company: sl === 'aws' ? 'AWS' : 'Quadron', goal: null, criteria: null, timeline: null, video_url: null, slides_url: null, logo_path: null, seat_cap: sl === 'aws' ? 10 : 20 });
  const cohort = isCohort ? mk(slug) : null;
  // The results schema is unique (application_id, season) with one cohort_id, so a dual acceptance exists only in the demo: `cohorts` lists both (#318).
  const cohorts = outcome === 'cohort-both' ? [mk('aws'), mk('quadron')] : undefined;
  const o = isCohort ? 'cohort' : outcome;
  const result = { id: 1, outcome: o, status: 'approved', approved_at: now(), cohort_id: cohort ? cohort.id : null, ...(cohorts ? { cohorts } : {}), why_matched: 'You build for teachers and ship.', letter: isCohort ? 'Dear Applicant,\n\nWe picked you for this cohort. The Venn team' : LETTER(o), season: 'fall-2026', viewed_at: null, ceremony_done_at: null };
  return {
    id, user: { id: `demo-user-${id}`, email: 'demo@example.com' }, minor: opts.minor, season: 'fall-2026', result, cohort, mou: null, guiding: [],
    team: [], nextMember: 1, peer: { match_id: 1, i_am_down: false, they_are_down: false },
    onboarding: { started: false, profile_done: false, contact_done: false, mou_done: false, name: 'Maya Okafor', org: 'Lincoln High Robotics' },
    consent: { done: false, answers: {} }, minorMou: { minor_signed: false, parent_signed: false, parent_link_signed: false, parent_name: null, confirmed: false },
    phoneCode: null, parentTokens: new Map(), events: new Set(),
  };
}

export function createDemoSession(id: string, outcome: DemoOutcome, opts: { minor: boolean }): DemoState {
  const s = seedDemo(outcome, opts, id); store().set(id, s); return s;
}
export const getDemoSession = (id: string | null | undefined): DemoState | undefined => (id ? store().get(id) : undefined);
export const deleteDemoSession = (id: string): boolean => store().delete(id);

const ok = (data: unknown = null) => ({ data, error: null });
const err = (message: string) => ({ data: null, error: { message } });

function peerRow(s: DemoState) {
  const both = s.peer.i_am_down && s.peer.they_are_down;
  return { match_id: s.peer.match_id, partner_name: 'Maya', partner_org: 'Lincoln High', partner_project: 'A tutoring app for refugee teens', why_matched: 'You both build for teachers and want a partner who ships.', i_am_down: s.peer.i_am_down, they_are_down: s.peer.they_are_down, partner_email: both ? 'maya.demo@example.com' : null, partner_state: 'Ohio', partner_country: 'US' };
}

function teamRows(s: DemoState) {
  const lead = { member_id: null, email: s.user.email, state: '', is_me: true, lead_is_me: true };
  return [lead, ...s.team];
}

function rpc(s: DemoState, name: string, a: Record<string, any> = {}) {
  switch (name) {
    case 'get_my_peer': return ok(s.result.outcome === 'peer' ? [peerRow(s)] : []);
    case 'peer_down': s.peer.i_am_down = true; s.peer.they_are_down = true; return ok([peerRow(s)]);
    case 'mark_viewed': s.result.viewed_at ??= now(); return ok(s.result.viewed_at);
    case 'finish_ceremony': s.result.ceremony_done_at ??= now(); return ok(s.result.ceremony_done_at);
    case 'save_phone': s.phoneCode ??= 'VENN-4F2K'; return ok(s.phoneCode);
    case 'give_consent': s.consent = { done: true, answers: { ...a.clauses } }; return ok(1);
    case 'consent_state': return ok({ done: s.consent.done, application: true, minor: s.minor, answers: s.consent.answers });
    case 'get_my_team': return ok(teamRows(s));
    case 'add_team_member': { const id = s.nextMember++; s.team.push({ member_id: id, email: a.p_email, state: 'Invited', is_me: false, lead_is_me: true }); return ok({ member_id: id }); }
    case 'remove_team_member': s.team = s.team.filter((m) => m.member_id !== a.p_member_id); return ok('removed');
    case 'sign_mou':
      if (!a.p_agreed) return err('You need to agree to sign.');
      s.mou = { id: 1, result_id: a.p_result_id, cohort_id: s.result.cohort_id, typed_name: a.p_typed_name, agreed: true, signed_at: now(), user_id: s.user.id };
      s.onboarding.mou_done = true; return ok(s.mou);
    case 'portal_is_lead': return ok(true);
    case 'cohort_org_count': return ok(s.cohort ? 12 : null);
    case 'portal_event': s.events.add(a.p_step); return ok();
    case 'get_my_first_name': return ok(s.onboarding.name);
    case 'get_onboarding':
      return ok({ required: true, started: s.onboarding.started, profile_done: s.onboarding.profile_done, contact_done: s.onboarding.contact_done, minor: s.minor, mou_done: s.onboarding.mou_done, name: s.onboarding.name, org: s.onboarding.org });
    case 'start_onboarding': s.onboarding.started = true; return ok();
    case 'save_onboarding_profile': s.onboarding.profile_done = true; if (a.p_name) s.onboarding.name = a.p_name; return ok();
    case 'save_onboarding_contact': s.onboarding.contact_done = true; return ok();
    case 'save_guiding_answers': {
      for (const [question, answer] of Object.entries(a.p_answers ?? {})) {
        const row = s.guiding.find((r) => r.question === question);
        if (row) row.answer = answer; else s.guiding.push({ result_id: a.p_result_id, question, answer });
      }
      return ok(s.guiding.filter((r) => r.result_id === a.p_result_id).map(({ question, answer }) => ({ question, answer })));
    }
    case 'minor_mou_state': return ok({ minor: s.minor, ...s.minorMou });
    case 'minor_mou_sign':
      if (a.p_role === 'parent') { s.minorMou.parent_signed = true; s.minorMou.parent_name = a.p_parent_name ?? null; } else s.minorMou.minor_signed = true;
      return ok();
    case 'minor_mou_confirm': s.minorMou.confirmed = true; s.onboarding.mou_done = true; return ok();
    case 'request_parent_consent': { const t = `demo-parent-${s.parentTokens.size + 1}`; s.parentTokens.set(t, 'ok'); return ok(t); }
    case 'parent_consent_state': return ok(s.parentTokens.get(a.p_token) ?? 'unknown');
    case 'sign_parent_consent': if (s.parentTokens.has(a.p_token)) { s.parentTokens.set(a.p_token, 'used'); s.minorMou.parent_link_signed = true; } return ok();
    case 'parent_consent_context': return ok([{ first_name: s.onboarding.name.split(' ')[0], cohort_name: s.cohort?.name ?? 'Venn Fall Cohort 2026' }]);
    case 'portal_rate_hit': return ok(0);
    case 'portal_link_live': return ok(true);
    case 'match_mail_target': return ok(null);
    case 'portal_consume_link': case 'match_mail_done': case 'record_step': case 'submit_share': case 'referral_status': return ok();
    default: return err(`demo: unknown rpc ${name}`);
  }
}

function tableRows(s: DemoState, table: string): Row[] {
  if (table === 'results') return [{ ...s.result, cohort: s.cohort }];
  if (table === 'mou_signatures') return s.mou ? [s.mou] : [];
  if (table === 'guiding_answers') return s.guiding.map((r) => ({ ...r }));
  if (table === 'cohorts') return s.cohort ? [s.cohort] : [];
  return [];
}

// Thenable builder: filters are applied on resolve; select columns are not projected (callers read the fields they need).
function from(s: DemoState, table: string) {
  let rows = tableRows(s, table); let single: 'maybe' | 'one' | null = null; let max = Infinity;
  const b: any = {
    select: () => b, order: () => b, neq: () => b,
    eq: (col: string, v: unknown) => { rows = rows.filter((r) => r[col] === v); return b; },
    limit: (n: number) => { max = n; return b; },
    maybeSingle: () => { single = 'maybe'; return b; }, single: () => { single = 'one'; return b; },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
      const out = rows.slice(0, max);
      const v = single === 'maybe' ? ok(out[0] ?? null) : single === 'one' ? (out[0] ? ok(out[0]) : err('demo: no row')) : ok(out);
      return Promise.resolve(v).then(res, rej);
    },
  };
  return b;
}

export function fakeClient(s: DemoState) {
  const session = { access_token: 'demo', user: s.user };
  const email = (e?: string) => { if (e) s.user.email = e; };
  return {
    auth: {
      signInWithPassword: async (c: { email?: string }) => { email(c?.email); return ok({ user: s.user, session }); },
      getUser: async () => ok({ user: s.user }),
      getSession: async () => ok({ session }),
      verifyOtp: async () => ok({ user: s.user, session }),
      exchangeCodeForSession: async () => ok({ user: s.user, session }),
      signInWithOtp: async () => ok({}),
      resetPasswordForEmail: async () => ok({}),
      updateUser: async () => ok({ user: s.user }),
      signOut: async () => ({ error: null }),
    },
    rpc: async (name: string, args?: Record<string, any>) => rpc(s, name, args),
    from: (table: string) => from(s, table),
  };
}

/** The fake client for a demo session id, or null when the id has no session. */
export const demoClientFor = (id: string | null | undefined) => { const s = getDemoSession(id); return s ? fakeClient(s) : null; };
