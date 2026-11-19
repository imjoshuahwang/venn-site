// Derives the next-step picker input from rows the signed-in Applicant can read (#131). Pure; no network.
import type { NextStepInput } from './next-step';

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
