// Live home loader (#131): reads the rows the signed-in Applicant can see and hands them to the pure derivation.
import type { SupabaseClient } from '@supabase/supabase-js';
import { deriveNextStepInput } from '../../scripts/portal/home-state.ts';
import type { NextStepInput } from '../../scripts/portal/next-step.ts';

export type Home = {
  input: NextStepInput;
  result: { id: number; outcome: string } | null;
  team: { email_key: string }[];
  cohortName: string | null;
};

type Rows<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;
const read = async <T>(q: Rows<T>): Promise<T | null> => {
  const r = await q;
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

export async function loadHome(sb: SupabaseClient): Promise<Home> {
  const res = await read<{ id: number; outcome: string; phone: string | null; cohort: { name: string; timeline: string | null } | null }>(
    sb.from('results').select('id, outcome, phone, cohort:cohorts(name, timeline)').eq('status', 'approved').order('approved_at', { ascending: false }).limit(1).maybeSingle() as never);
  const [parents, consents] = await Promise.all([
    read<{ signed_at: string | null }[]>(sb.from('parent_consents').select('signed_at').limit(1) as never),
    read<{ accepted: boolean }[]>(sb.from('consents').select('accepted') as never),
  ]);
  let guidingCount = 0, mouSigned: boolean | null = null, team: { email_key: string }[] = [];
  if (res) {
    const [g, m, t] = await Promise.all([
      read<unknown[]>(sb.from('guiding_answers').select('id').eq('result_id', res.id) as never),
      read<unknown[]>(sb.from('mou_signatures').select('id').eq('result_id', res.id) as never),
      read<{ email_key: string }[]>(sb.from('team_members').select('email_key').eq('lead_result_id', res.id).is('removed_at', null) as never),
    ]);
    guidingCount = g?.length ?? 0;
    mouSigned = (m?.length ?? 0) > 0;
    team = t ?? [];
  }
  const input = deriveNextStepInput({
    outcome: res?.outcome ?? null, phone: res?.phone ?? null, timeline: res?.cohort?.timeline ?? null, mouSigned,
    parent: parents && parents.length ? { signed_at: parents[0].signed_at } : null, consents: consents ?? [], guidingCount,
  });
  return { input, result: res ? { id: res.id, outcome: res.outcome } : null, team, cohortName: res?.cohort?.name ?? null };
}
