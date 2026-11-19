import type { SupabaseClient } from '@supabase/supabase-js';
import type { Outcome } from '../../data/portal-copy';

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
