// The home page's one next-step card, picked by a pure function (#131). Order follows #131 (waiting on parent, consent,
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
  if (i.consentGiven === false) return step('consent-missing', '/portal/consent');
  if (i.outcome === 'cohort' && i.mouSigned === false) return step('sign-mou', '/portal/result');
  if (i.guidingAnswered === false) return step('guiding-questions', '/portal/questions');
  if (i.phoneSaved === false) return step('text-josh', '#text-josh');
  const at = i.kickoffAt ? Date.parse(i.kickoffAt) : NaN;
  if (Number.isFinite(at) && at > now) return step('kickoff-countdown', null, Math.ceil((at - now) / DAY));
  return step('all-set');
}
