// Per-partner reveal config (#226). #229 adds Quadron copy by editing this entry, never by forking the component.
export type RevealPartner = { key: string; name: string; cohortTitle: string; logo: string; line: string };

export const PARTNERS: Record<string, RevealPartner> = {
  aws: { key: 'aws', name: 'AWS', cohortTitle: 'Fall Cohort 2026', logo: '/logos/aws.svg', line: 'Amazon Web Services' },
  quadron: { key: 'quadron', name: 'Quadron', cohortTitle: 'Fall Cohort 2026', logo: '/logos/quadron.svg', line: 'Fall Cohort 2026' },
};

export const partnerFor = (slug: unknown): RevealPartner | null => (typeof slug === 'string' && Object.hasOwn(PARTNERS, slug) ? PARTNERS[slug] : null);

export const popupTitle = (p: RevealPartner) => `Accepted into ${p.name}`;
