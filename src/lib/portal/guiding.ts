import type { SupabaseClient } from '@supabase/supabase-js';
import { GUIDING_IDS, type GuidingAnswers } from '../../data/guiding.ts';

export class GuidingError extends Error {
  code?: string;
  constructor(e: { message?: string; code?: string }) { super(e.message ?? 'guiding error'); this.code = e.code; }
}

const toMap = (rows: { question: string; answer: string }[] | null): GuidingAnswers => {
  const out: GuidingAnswers = {};
  for (const r of rows ?? []) if ((GUIDING_IDS as readonly string[]).includes(r.question)) out[r.question as keyof GuidingAnswers] = r.answer;
  return out;
};

/** The caller's saved answers for a result (RLS: owner or live team member). */
export async function getMyGuidingAnswers(sb: Pick<SupabaseClient, 'from'>, resultId: number): Promise<GuidingAnswers> {
  const { data, error } = await sb.from('guiding_answers').select('question, answer').eq('result_id', resultId);
  if (error) throw new GuidingError(error);
  return toMap(data as never);
}

/** Upserts the given answers via save_guiding_answers and returns every saved answer for the result. */
export async function saveGuidingAnswers(sb: Pick<SupabaseClient, 'rpc'>, resultId: number, answers: Record<string, string>): Promise<GuidingAnswers> {
  const { data, error } = await sb.rpc('save_guiding_answers', { p_result_id: resultId, p_answers: answers });
  if (error) throw new GuidingError(error);
  return toMap(data as never);
}

/** Dev fixture for the fixture route. */
export const STUB_GUIDING: GuidingAnswers = { goal: 'Ship a pilot with a real partner.', skills: 'Design and React.', availability: 'Weekday evenings.' };

/** What the form may do: team members read, the lead edits until the cutoff (null = always open). */
export function guidingAccess({ isLead, cutoff, now = new Date() }: { isLead: boolean; cutoff: string | null | undefined; now?: Date }): 'edit' | 'closed' | 'readonly' {
  if (!isLead) return 'readonly';
  return cutoff && now.getTime() >= new Date(cutoff).getTime() ? 'closed' : 'edit';
}
