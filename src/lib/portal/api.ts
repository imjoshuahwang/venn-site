import type { SupabaseClient } from '@supabase/supabase-js';
import type { Step } from './track.ts';

export type ApiError = { message: string; code?: string };
export type Api<T> = { data: T | null; error: ApiError | null };

export type Cohort = { id: number; slug: string; name: string; company: string | null; goal: string | null; criteria: string | null; timeline: string | null; video_url: string | null; slides_url: string | null; logo_path: string | null; seat_cap: number };
export type PortalResult = {
  id: number; outcome: 'cohort' | 'peer' | 'network_waitlist' | 'track_waitlist' | 'not_this_season';
  cohort_id: number | null; why_matched: string | null; letter: string | null; season: string; viewed_at: string | null; ceremony_done_at: string | null;
  cohort: Cohort | null;
};
export type PeerCard = {
  match_id: number; partner_name: string; partner_org: string | null; partner_project: string | null; why_matched: string | null;
  i_am_down: boolean; they_are_down: boolean; partner_email: string | null;
  partner_state: string | null; partner_country: string | null;
};
export type MouSignature = { id: number; result_id: number; cohort_id: number; typed_name: string; agreed: boolean; signed_at: string; user_id: string };

const wrap = <T>(r: { data: T | null; error: { message: string; code?: string } | null }): Api<T> =>
  r.error ? { data: null, error: { message: r.error.message, code: r.error.code } } : { data: r.data, error: null };

/** The caller's approved result for the season (RLS limits rows to approved, owned), with its cohort; null when none. */
export async function getMyResult(sb: SupabaseClient, season = 'fall-2026'): Promise<Api<PortalResult>> {
  const r = await sb.from('results').select('*, cohort:cohorts(*)').eq('season', season).limit(1).maybeSingle();
  return wrap<PortalResult>(r as never);
}

export async function markViewed(sb: SupabaseClient, resultId: number): Promise<Api<string>> {
  return wrap<string>(await sb.rpc('mark_viewed', { p_result_id: resultId }));
}

export async function finishCeremony(sb: SupabaseClient, resultId: number): Promise<Api<string>> {
  return wrap<string>(await sb.rpc('finish_ceremony', { p_result_id: resultId }));
}

/** The Peer card, or data null (no error) when the caller has no approved peer match. */
export async function getMyPeer(sb: SupabaseClient, season = 'fall-2026'): Promise<Api<PeerCard>> {
  const r = await sb.rpc('get_my_peer', { p_season: season });
  if (r.error) return wrap<PeerCard>(r as never);
  const row = Array.isArray(r.data) ? r.data[0] : r.data;
  return { data: (row as PeerCard) ?? null, error: null };
}

export async function peerDown(sb: SupabaseClient, matchId: number): Promise<Api<PeerCard>> {
  const r = await sb.rpc('peer_down', { p_match_id: matchId });
  if (r.error) return wrap<PeerCard>(r as never);
  const row = Array.isArray(r.data) ? r.data[0] : r.data;
  return { data: (row as PeerCard) ?? null, error: null };
}

/** Saves the lead's phone and mints (once) the VENN-XXXX text code; same code on every later call (#132). */
export async function savePhone(sb: SupabaseClient, phone: string, whatsapp: boolean): Promise<Api<string>> {
  return wrap<string>(await sb.rpc('save_phone', { p_phone: phone, p_whatsapp: whatsapp }));
}

export async function giveConsent(sb: SupabaseClient, clauses: Record<string, boolean>, version: string): Promise<Api<number>> {
  return wrap<number>(await sb.rpc('give_consent', { clauses, version }));
}

export type TeamRow = { member_id: number | null; email: string; state: string; is_me: boolean; lead_is_me: boolean };

export async function getMyTeam(sb: SupabaseClient): Promise<Api<TeamRow[]>> {
  return wrap<TeamRow[]>(await sb.rpc('get_my_team'));
}
export async function addTeamMember(sb: SupabaseClient, email: string): Promise<Api<unknown>> {
  return wrap<unknown>(await sb.rpc('add_team_member', { p_email: email }));
}
export async function removeTeamMember(sb: SupabaseClient, memberId: number): Promise<Api<string>> {
  return wrap<string>(await sb.rpc('remove_team_member', { p_member_id: memberId }));
}

export async function signMou(sb: SupabaseClient, resultId: number, typedName: string, agreed: boolean): Promise<Api<MouSignature>> {
  return wrap<MouSignature>(await sb.rpc('sign_mou', { p_result_id: resultId, p_typed_name: typedName, p_agreed: agreed }));
}

export type ConsentState = { done: boolean; application: boolean; minor: boolean; answers: Record<string, boolean> };
export async function getConsentState(sb: SupabaseClient, version: string): Promise<Api<ConsentState>> {
  return wrap<ConsentState>(await sb.rpc("consent_state", { p_version: version }));
}

/** The caller's MOU signature for a result (RLS: own rows only); data null (no error) when unsigned. */
export async function getMyMouSignature(sb: SupabaseClient, resultId: number): Promise<Api<MouSignature>> {
  const r = await sb.from('mou_signatures').select('*').eq('result_id', resultId).limit(1).maybeSingle();
  return wrap<MouSignature>(r as never);
}

/** True when the caller is the lead (owner) of the result's team; non-leads see "your lead signs". */
export async function isLead(sb: SupabaseClient, resultId: number): Promise<Api<boolean>> {
  return wrap<boolean>(await sb.rpc('portal_is_lead', { p_result_id: resultId }));
}

/** Approved orgs in the result's cohort, for "N orgs in this cohort"; null when the result has no cohort. */
export async function cohortOrgCount(sb: SupabaseClient, resultId: number): Promise<Api<number>> {
  return wrap<number>(await sb.rpc('cohort_org_count', { p_result_id: resultId }));
}

/** Records one funnel step for the caller's result (once per step). Best effort: never throws, never blocks the page. */
export async function portalEvent(sb: SupabaseClient, step: Step): Promise<void> {
  try { await sb.rpc('portal_event', { p_step: step }); } catch { /* the funnel is not worth a failed page */ }
}
