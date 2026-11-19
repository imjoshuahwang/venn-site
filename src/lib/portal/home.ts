import type { SupabaseClient } from '@supabase/supabase-js';

// Next-step card, picked by a pure function. Order follows #131 (waiting on parent, consent,
// MOU, guiding questions, Text Josh, kickoff countdown, all set). A null input field means "no data": that state is skipped.
export type NextStepInput = {
  under18: boolean | null;
  parentSigned: boolean | null;
  consentGiven: boolean | null;
  mouSigned: boolean | null;
  outcome: string | null;
  guidingAnswered: boolean | null;
  phoneSaved: boolean | null;
  kickoffAt: string | null;
};
export type NextStepKind = 'waiting-on-parent' | 'consent-missing' | 'sign-mou' | 'guiding-questions' | 'text-josh' | 'kickoff-countdown' | 'all-set';
export type NextStep = { kind: NextStepKind; href: string | null; days: number | null };

const DAY = 86_400_000;
const step = (kind: NextStepKind, href: string | null = null, days: number | null = null): NextStep => ({ kind, href, days });

export function pickNextStep(input: NextStepInput | null | undefined, now: number = Date.now()): NextStep {
  const i = input ?? ({} as Partial<NextStepInput>);
  if (i.under18 === true && i.parentSigned !== true) return step('waiting-on-parent');
  if (i.consentGiven === false) return step('consent-missing', '/portal/result');
  if (i.outcome === 'cohort' && i.mouSigned === false) return step('sign-mou', '/portal/result');
  if (i.guidingAnswered === false) return step('guiding-questions', '/portal/result');
  if (i.phoneSaved === false) return step('text-josh');
  const at = i.kickoffAt ? Date.parse(i.kickoffAt) : NaN;
  if (Number.isFinite(at) && at > now) return step('kickoff-countdown', null, Math.ceil((at - now) / DAY));
  return step('all-set');
}

export type HomeRaw = {
  outcome: string | null;
  phone: string | null;
  timeline: string | null; // cohorts.timeline; the first ISO date in it is the kickoff
  mouSigned: boolean | null;
  parent: { signed_at: string | null } | null; // parent_consents row for this user; present means under 18
  consents: { accepted: boolean }[];
  guidingCount: number;
};

export function kickoffFromTimeline(timeline: string | null): string | null {
  const m = timeline?.match(/\d{4}-\d{2}-\d{2}/);
  return m ? `${m[0]}T00:00:00Z` : null;
}

export function deriveNextStepInput(raw: HomeRaw): NextStepInput {
  const cohort = raw.outcome === 'cohort';
  return {
    under18: raw.parent !== null,
    parentSigned: raw.parent ? raw.parent.signed_at !== null : null,
    consentGiven: raw.consents.some((c) => c.accepted),
    mouSigned: cohort ? raw.mouSigned : null,
    outcome: raw.outcome,
    guidingAnswered: cohort ? raw.guidingCount > 0 : null,
    phoneSaved: !!raw.phone,
    kickoffAt: kickoffFromTimeline(raw.timeline),
  };
}

export type Home = {
  input: NextStepInput;
  result: { id: number; outcome: string } | null;
  team: { email_key: string }[];
  cohortName: string | null;
  phone: string | null;
  code: string | null;
};

type Rows<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;
const read = async <T>(q: Rows<T>): Promise<T | null> => {
  const r = await q;
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

export async function loadHome(sb: SupabaseClient): Promise<Home> {
  const res = await read<{ id: number; outcome: string; phone: string | null; text_code: string | null; cohort: { name: string; timeline: string | null } | null }>(
    sb.from('results').select('id, outcome, phone, text_code, cohort:cohorts(name, timeline)').eq('status', 'approved').order('approved_at', { ascending: false }).limit(1).maybeSingle() as never);
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
  return { input, result: res ? { id: res.id, outcome: res.outcome } : null, team, cohortName: res?.cohort?.name ?? null, phone: res?.phone ?? null, code: res?.text_code ?? null };
}
