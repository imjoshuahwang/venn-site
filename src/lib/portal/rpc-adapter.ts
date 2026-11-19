import type { SupabaseClient } from '@supabase/supabase-js';
import type { Outcome } from '../../data/portal-copy';
import type { PeerContact, PeerRow } from '../../data/portal-peer';

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
  if (outcome === 'network_waitlist' || outcome === 'track_waitlist' || outcome === 'not_this_season') {
    return { outcome, letter: `Dear Applicant,\n\nThank you for applying this Season. This is a stand-in letter for ${outcome}.\n\nThe Venn team` };
  }
  return null;
}

/** The caller's Peer match (card fields and which sides are down). Name follows #116's get_my_peer. */
export async function getMyPeer(supabase: Pick<SupabaseClient, 'rpc'>): Promise<PeerRow | null> {
  const { data, error } = await supabase.rpc('get_my_peer');
  if (error) throw error;
  return (data as PeerRow | null) ?? null;
}

/** Taps "I'd be down". Returns the other Peer's contact only once both are down (peer_down is the sole source). */
export async function peerDown(supabase: Pick<SupabaseClient, 'rpc'>, matchId: number): Promise<PeerContact | null> {
  const { data, error } = await supabase.rpc('peer_down', { match_id: matchId });
  if (error) throw error;
  return (data as PeerContact | null) ?? null;
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
