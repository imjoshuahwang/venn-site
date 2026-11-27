import type { SupabaseClient } from '@supabase/supabase-js';

export type MatchStatus = 'draft' | 'unmatched' | 'approved' | 'revealed' | 'requested' | 'accepted' | 'declined' | 'expired' | 'withdrawn' | 'reported';

export type MyMatch = {
  match_id: number; status: MatchStatus; fit: unknown; draft_message: string | null; message: string | null; learn: string | null;
  viewed_at: string | null; requested_at: string | null; responded_at: string | null; expires_at: string | null;
  requests_used: number; rematches_used: number;
  peer_first_name: string | null; peer_org: string | null; peer_region: string | null; peer_project: string | null;
  peer_name: string | null; peer_email: string | null; peer_phone: string | null;
};

export type IntroView = {
  state: 'unknown' | 'open' | 'expired' | MatchStatus;
  requester_first_name: string | null; requester_org: string | null; requester_region: string | null;
  message: string | null; learn: string | null; expires_at: string | null;
};

export type IntroAction = 'accept' | 'decline' | 'optout';

async function call<T>(supabase: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

const first = <T>(d: T[] | T | null): T | null => (Array.isArray(d) ? d[0] ?? null : d ?? null);

/** The signed-in student's current match for the Season (null when none). Other-side contact is null until accepted. */
export const getMyMatch = async (s: SupabaseClient, season = 'fall-2026') => first(await call<MyMatch[]>(s, 'get_my_match', { p_season: season }));
export const matchViewed = (s: SupabaseClient, id: number) => call<string>(s, 'match_viewed', { p_match_id: id });
export const matchRequest = (s: SupabaseClient, id: number, message: string, learn?: string) =>
  call<string>(s, 'match_request', { p_match_id: id, p_message: message, p_learn: learn ?? null });
export const matchWithdraw = (s: SupabaseClient, id: number) => call<void>(s, 'match_withdraw', { p_match_id: id });
export const matchRematch = (s: SupabaseClient, id: number) => call<number>(s, 'match_rematch', { p_match_id: id });
export const matchReport = (s: SupabaseClient, id: number) => call<void>(s, 'match_report', { p_match_id: id });

/** Token page, GET side: read-only. Takes the sha-256 hex of the token, never the token itself. */
export const introByToken = async (s: SupabaseClient, tokenHash: string) => first(await call<IntroView[]>(s, 'intro_by_token', { p_token_hash: tokenHash }));
/** Token page, POST side. */
export const introRespond = async (s: SupabaseClient, tokenHash: string, action: IntroAction) =>
  first(await call<Array<{ outcome: string; requester_name: string | null; requester_email: string | null; requester_phone: string | null; peer_name: string | null; peer_email: string | null; peer_phone: string | null }>>(s, 'intro_respond', { p_token_hash: tokenHash, p_action: action }));

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escape a student's free text before it goes into mail HTML. */
export const escapeHtml = (t: string) => t.replace(/[&<>"']/g, (c) => ESC[c]);
