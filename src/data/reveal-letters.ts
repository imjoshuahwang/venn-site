// Acceptance letters (#322): one slide list per cohort, shown after the celebration. Each slide answers one question the student has at that
// moment: am I in, what is it, what do I get, what do I do next. Copy is long and human on purpose. `seatCap` always comes from the cohort row.
export type LetterSlide = { title: string; lead?: string; paragraphs: string[]; list?: { head: string; text: string }[]; cta: string; action?: { label: string; href: string } };
export type LetterCtx = { seatCap?: number | null };

export const VENN_CONTACT = 'contact@joinvenn.org';
/** Read from PUBLIC_QUADRON_CONTACT_EMAIL so no real address lives in this public repo (#322). Never shown as text; only the Email Dan action points at it. */
export const DAN_EMAIL_FALLBACK = 'dan@example.com';
export const DAN_EMAIL: string = (import.meta as { env?: Record<string, string | undefined> }).env?.PUBLIC_QUADRON_CONTACT_EMAIL || DAN_EMAIL_FALLBACK;

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const count = (n: number) => NUMBER_WORDS[n] ?? String(n);
const oneOf = (seatCap?: number | null) => (seatCap && seatCap > 0 ? `one of ${count(seatCap)} students` : 'one of a small group of students');

const aws = ({ seatCap }: LetterCtx): LetterSlide[] => [
  { title: 'Welcome to the AWS cohort.', paragraphs: [
    `You are ${oneOf(seatCap)} we picked for the Venn x AWS Fall 2026 cohort. We read a lot of applications this season, and the way you described what you want to build is one we kept going back to.`,
    'Take a second with that. Nothing is asked of you on this screen, so the next few are only here to tell you what you just joined.',
  ], cta: 'What is the cohort?' },
  { title: 'You will teach younger students.', lead: 'Members work with AWS to pass on the habits AWS hopes young people grow up with.', paragraphs: [
    'These come from the Amazon Leadership Principles, the ones AWS works by. You will turn four of them into sessions, workshops and club events for students a few years behind you.',
  ], list: [
    { head: 'Learn and Be Curious', text: 'Keep exploring, even when nobody is grading it.' },
    { head: 'Bias for Action', text: 'Build a small thing this week. Most choices can be undone.' },
    { head: 'Think Big', text: 'Picture something that helps your school or your town.' },
    { head: 'Earn Trust', text: 'Listen first. It is what makes a good teacher.' },
  ], cta: 'What do I get?' },
  { title: 'You get to see it land.', paragraphs: [
    'You work with AWS people, you teach real students, and you watch what they go on to build, so the impact is something you can point at and not a line on a form.',
    'AWS staff worked directly with Venn to shape the courses and curriculum, so what you teach lines up with what AWS cares about. It is an informal link, not an official or paid AWS program.',
  ], cta: 'What do I do next?' },
  { title: 'Stay in touch with us.', lead: 'That is the whole next step.', paragraphs: [
    `Write to Josh and the Venn team at ${VENN_CONTACT} whenever you like, even just to say hi. We will walk you through your first session from there.`,
  ], cta: 'Continue', action: { label: 'Email Venn', href: `mailto:${VENN_CONTACT}?subject=${encodeURIComponent('Venn x AWS Fall 2026: hello')}` } },
];

const quadron = ({ seatCap }: LetterCtx): LetterSlide[] => [
  { title: 'Welcome to the Quadron cohort.', paragraphs: [
    `You are ${oneOf(seatCap)} we picked for the Venn x Quadron Fall 2026 cohort. We read a lot of applications this season, and yours made the short pile for a reason we were glad to find.`,
    'Take a second with that, then read on for what this cohort is and the one thing to do next.',
  ], cta: 'What is the cohort?' },
  { title: 'Dan Pratl wants to talk to you.', lead: 'Read who he is before you write.', paragraphs: [
    'He is the person to talk to first, and a few minutes on his page will make your first email better.',
  ], cta: 'What do I get?', action: { label: 'pratl.me', href: 'https://pratl.me' } },
  { title: 'Your club builds something real.', paragraphs: [
    'Your club will create an event, a competition or a community benefit, and you decide which. Venn gives you the courses, the curriculum and the materials, and matches you with a Venn mentor.',
    'This is an informal association between Venn and Quadron, not an official, paid or corporate deal.',
  ], cta: 'What do I do next?' },
  { title: 'Email Dan.', lead: 'One email is the whole job.', paragraphs: [
    'Tell him who you are and what your club wants to build. He wants to hear it from you, in your own words.',
  ], cta: 'Continue', action: { label: 'Email Dan', href: `mailto:${DAN_EMAIL}?subject=${encodeURIComponent('Venn x Quadron Fall 2026: hello Dan')}` } },
];

export const LETTERS: Record<string, (c: LetterCtx) => LetterSlide[]> = { aws, quadron };
export const lettersFor = (slug: string, ctx: LetterCtx): LetterSlide[] | null => (Object.hasOwn(LETTERS, slug) ? LETTERS[slug](ctx) : null);
