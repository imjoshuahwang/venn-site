export const CONTACT = 'contact@joinvenn.org';

export type Outcome = 'cohort' | 'peer' | 'network_waitlist' | 'track_waitlist' | 'not_this_season';
export type ResultPage = 'waitlist' | 'not_this_season';

export const COPY = {
  network_waitlist: {
    heading: 'You are on the Network waitlist',
    note: 'The Network is open to waitlisted Applicants first, and we will write to you as each Program opens.',
    perks: ['Early word on new Programs', 'A seat at Network events'],
  },
  track_waitlist: {
    heading: 'You are on the Track waitlist',
    note: 'Runners-up can fill Cohort seats left unclaimed after 5 days, and we will write to you the moment one opens.',
    perks: ['First look at any seat that opens', 'Early word on new Programs'],
  },
  not_this_season: {
    heading: 'Not this Season',
    note: 'We would love to see you apply again, and a few things tend to make an application stronger.',
    tips: ['Show something you built or ran, with a link we can open', 'Tell us what you learned and what you would do next', 'Say who you would bring along'],
  },
} as const;

export function pageFor(outcome: string): ResultPage | null {
  if (outcome === 'network_waitlist' || outcome === 'track_waitlist') return 'waitlist';
  if (outcome === 'not_this_season') return 'not_this_season';
  return null;
}

/** Everything a Result page needs. `letter` is trimmed plain text, or null so the page shows its empty state. */
export function viewFor(outcome: 'network_waitlist' | 'track_waitlist' | 'not_this_season', letter: unknown) {
  const c = COPY[outcome];
  const text = typeof letter === 'string' ? letter.trim() : '';
  return {
    heading: c.heading,
    note: c.note,
    perks: 'perks' in c ? [...c.perks] : [],
    tips: 'tips' in c ? [...c.tips] : [],
    letter: text || null,
  };
}
