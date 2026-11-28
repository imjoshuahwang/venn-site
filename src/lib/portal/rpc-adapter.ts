import type { SupabaseClient } from '@supabase/supabase-js';
import type { Outcome } from '../../data/portal-copy';
import type { PeerContact, PeerRow } from '../../data/portal-peer';
import { getMyMouSignature, isLead, cohortOrgCount } from './api.ts';

export type CohortView = { signature: { typed_name: string; signed_at: string } | null; isLead: boolean; orgCount: number | null };

/** What the Cohort page needs beyond the result: signed state (from mou_signatures), lead flag, org count. Throws on any read error. */
export async function getCohortView(supabase: SupabaseClient, resultId: number): Promise<CohortView> {
  const [sig, lead, count] = await Promise.all([getMyMouSignature(supabase, resultId), isLead(supabase, resultId), cohortOrgCount(supabase, resultId)]);
  const err = sig.error ?? lead.error ?? count.error;
  if (err) throw new Error(err.message);
  return { signature: sig.data ? { typed_name: sig.data.typed_name, signed_at: sig.data.signed_at } : null, isLead: lead.data === true, orgCount: count.data };
}

export type MyResult = { outcome: Outcome; letter: string | null };

/** The signed-in Applicant's approved Result (RLS scopes the rows to them). Names follow #116's getMyResult. */
export async function getMyResult(supabase: SupabaseClient): Promise<MyResult | null> {
  const { data, error } = await supabase
    .from('results')
    .select('outcome, letter')
    .eq('status', 'approved')
    .order('approved_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? { outcome: data.outcome as Outcome, letter: data.letter ?? null } : null;
}

/** Dev-only stand-in so the real /portal route can be exercised without a database. */
export function stubResult(outcome: string | null): MyResult | null {
  if (outcome === 'cohort') return { outcome, letter: null };
  if (outcome === 'network_waitlist' || outcome === 'track_waitlist' || outcome === 'not_this_season') {
    return { outcome, letter: `Dear Applicant,\n\nThank you for applying this Season. This is a stand-in letter for ${outcome}.\n\nThe Venn team` };
  }
  return null;
}

/** Row shape of #116's get_my_peer and peer_down (table functions; partner_email is null until both are down). */
type PeerRpcRow = {
  match_id: number; partner_name: string | null; partner_org: string | null; partner_project: string | null;
  why_matched: string | null; i_am_down: boolean; they_are_down: boolean; partner_email: string | null;
  partner_state?: string | null; partner_country?: string | null;
};

const one = (data: unknown): PeerRpcRow | null => (Array.isArray(data) ? data[0] : data) ?? null;
const many = (data: unknown): PeerRpcRow[] => (Array.isArray(data) ? data : data ? [data as PeerRpcRow] : []);

const toPeerRow = (r: PeerRpcRow): PeerRow => {
  const region = [r.partner_state, r.partner_country].map((v) => v?.trim()).filter(Boolean).join(', ');
  const both = r.i_am_down && r.they_are_down && !!r.partner_email;
  return {
    match_id: r.match_id, first_name: r.partner_name ?? undefined, project: r.partner_project ?? undefined,
    place: region || (r.partner_org ?? undefined), why_matched: r.why_matched ?? undefined, mine_down: r.i_am_down, theirs_down: r.they_are_down,
    // get_my_peer already withholds the email until both are down, so a load can show the reveal without re-tapping.
    contact: both ? { name: r.partner_name ?? undefined, email: r.partner_email! } : undefined,
  };
};

/** The caller's Peer matches, one per partner (two in a triad): card fields and which sides are down. #116 returns org where the card wants a place. */
export async function getMyPeers(supabase: Pick<SupabaseClient, 'rpc'>): Promise<PeerRow[]> {
  const { data, error } = await supabase.rpc('get_my_peer');
  if (error) throw error;
  return many(data).map(toPeerRow);
}

/** The caller's first Peer match, or null. */
export async function getMyPeer(supabase: Pick<SupabaseClient, 'rpc'>): Promise<PeerRow | null> {
  return (await getMyPeers(supabase))[0] ?? null;
}

/** Taps "I'd be down". Returns the other Peer's contact only once both are down (peer_down is the sole source). */
export async function peerDown(supabase: Pick<SupabaseClient, 'rpc'>, matchId: number): Promise<PeerContact | null> {
  const { data, error } = await supabase.rpc('peer_down', { p_match_id: matchId });
  if (error) throw error;
  const r = one(data);
  if (!r || !r.i_am_down || !r.they_are_down || !r.partner_email) return null;
  return { name: r.partner_name ?? undefined, email: r.partner_email };
}

/** Withdraws this student's "down": the server then returns no partner email to either side. */
export async function peerPass(supabase: Pick<SupabaseClient, 'rpc'>, matchId: number): Promise<void> {
  const { error } = await supabase.rpc('peer_pass', { p_match_id: matchId });
  if (error) throw error;
}

/** One in-flight call at a time: a second tap while sending shares the first call; a failure clears it so retry works. */
export function createPeerDownOnce<T>(send: () => Promise<T>): () => Promise<T> {
  let inflight: Promise<T> | null = null;
  return () => {
    if (!inflight) inflight = send().finally(() => { inflight = null; });
    return inflight;
  };
}

/** Dev-only Peer row for the fixture route; last name, school and photo are present to prove they never render. */
export function stubPeer(state: 'none' | 'waiting' | 'both') {
  return {
    match_id: 1, first_name: 'Maya', last_name: 'Okafor', school: 'Lincoln High', project: 'A tutoring app for refugee teens', place: 'Ohio, US',
    why_matched: 'You both build for teachers and want a partner who ships.', photo: 'maya.jpg',
    mine_down: state !== 'none', theirs_down: state === 'both',
  };
}
export const STUB_CONTACT: PeerContact = { name: 'Maya', email: 'maya.fixture@example.com', phone: '+1 555 010 0199' };

/** Dev-only save_phone stand-in: one fixed code per session, whatever the phone, like the real RPC (#132). */
export const stubSavePhone = (_phone: string, _whatsapp: boolean): string => 'VENN-4F2K';

/** Dev stub for the cohort reveal (#226): `?stub=cohort` is AWS, `&partner=quadron` swaps the config entry, any unknown value renders the neutral Venn reveal. No Supabase reads. */
export function stubCohort(partner: string | null) {
  // Any other `partner` value is passed through as an unknown cohort slug, to exercise the neutral reveal.
  const slug = partner ?? 'aws';
  const name = slug === 'quadron' ? 'Quadron' : slug === 'aws' ? 'AWS' : 'Venn';
  return {
    result: { id: 1, letter: 'Dear Applicant,\n\nWe picked you for this cohort. The Venn team', ceremony_done_at: null, cohort: { slug, name: `${name} Fall Cohort 2026`, company: name, logo_path: null, goal: null, criteria: null, timeline: null, video_url: null, slides_url: null } },
    view: { signature: null, isLead: false, orgCount: null },
  };
}
