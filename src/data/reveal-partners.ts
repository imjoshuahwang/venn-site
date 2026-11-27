// Per-partner reveal config (#226, #227). All user-facing copy lives here, keyed by partner, so Quadron (#229) is one more entry
// with a `copy` block and never a fork of a component. The words "partner" and "partnership" never appear in user-facing strings
// (src/data/reveal-partners.test.ts walks every string); internal keys named partner are fine.
export type PartnerCopy = {
  /** Said once on the checklist screen and in the letter: an informal link, never an official, paid or corporate deal. */
  association: string;
  intro: { title: string; body: string };
  items: { share: string; experience: string; phone: string; mou: string; email: string };
  card: { headline: string; sub: (cohortTitle: string) => string };
  letter: { title: string; paragraphs: string[]; mentor: string; button: string };
  linkedin: {
    /** Experience title, one-tap copy. Needs 16+ (LinkedIn's minimum age). */
    title: string;
    expTitle: string; expSteps: string[]; expButton: string;
    postTitle: string; postSteps: string[]; postButton: string;
    /** `{org}` becomes the club name when we know it. */
    post: string;
  };
};
export type RevealPartner = { key: string; name: string; cohortTitle: string; logo: string; line: string; copy?: PartnerCopy };

const AWS_COPY: PartnerCopy = {
  association: 'AWS staff worked directly with Venn to shape the courses and curriculum so they line up with AWS. It is an informal link, not an official, paid or corporate deal.',
  intro: { title: 'Five quick steps', body: 'Do it all now, start to finish, and you are done for today.' },
  items: { share: 'Share your news', experience: 'Add it to your LinkedIn Experience', phone: 'Add your phone number', mou: 'Sign the MOU', email: 'Email your Venn mentor' },
  card: { headline: 'I got accepted.', sub: (t) => `Venn x AWS ${t}` },
  letter: {
    title: 'What happens next',
    paragraphs: [
      'Your club will create an event, a competition or a community benefit. You pick it, and you run it through the organization that best matches what AWS cares about.',
      'We match you with a Venn mentor at contact@joinvenn.org. Venn gives you the courses, the curriculum and the materials.',
    ],
    mentor: 'AWS staff worked directly with Venn to shape the courses and curriculum so they line up with AWS. It is an informal link, not an official, paid or corporate deal.',
    button: 'Next',
  },
  linkedin: {
    title: 'Venn x AWS Fellow Fall 2026',
    expTitle: 'Add it to Experience',
    expSteps: ['Tap Open LinkedIn. Then tap Add position.', 'Paste the title below into Title.', 'Paste your club name into Company. Save.'],
    expButton: 'Open LinkedIn',
    postTitle: 'Post about it',
    postSteps: ['Tap Post on LinkedIn. Your text is already filled in.', 'Add your share card as the picture.', 'Tap Post.'],
    postButton: 'Post on LinkedIn',
    post: 'I just joined the Venn x AWS Fellow Fall 2026 cohort with {org}. AWS staff worked directly with Venn to shape the courses, so what we learn lines up with AWS. It is an informal link, not an official AWS program.',
  },
};

export const PARTNERS: Record<string, RevealPartner> = {
  aws: { key: 'aws', name: 'AWS', cohortTitle: 'Fall Cohort 2026', logo: '/logos/aws.svg', line: 'Amazon Web Services', copy: AWS_COPY },
  // #229: add `copy` here (logo stays /logos/quadron.svg). No Quadron copy is written in #227.
  quadron: { key: 'quadron', name: 'Quadron', cohortTitle: 'Fall Cohort 2026', logo: '/logos/quadron.svg', line: 'Fall Cohort 2026' },
};

export const partnerFor = (slug: unknown): RevealPartner | null => (typeof slug === 'string' && Object.hasOwn(PARTNERS, slug) ? PARTNERS[slug] : null);

export const popupTitle = (p: RevealPartner) => `Accepted into ${p.name}`;

/** Every user-facing string of a partner, for the copy tests. */
export function userFacingStrings(p: RevealPartner): string[] {
  const out: string[] = [popupTitle(p)];
  const walk = (v: unknown) => {
    if (typeof v === 'string') out.push(v);
    else if (typeof v === 'function') out.push((v as (t: string) => string)(p.cohortTitle));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(p.copy);
  return out;
}
