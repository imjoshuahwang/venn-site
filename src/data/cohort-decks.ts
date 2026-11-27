// Batch 1 cohort decks (#190): AWS and Quadron, one idea per slide, written in code so a deck can end in a button that opens a prefilled email.
// The company name appears as text only, never a logo; both cohorts are aligned with a company and never sponsored by it.

export type DeckSlide = {
  kicker?: string;
  logo?: string | null;
  big: string;
  sub?: string;
  video?: { src: string; poster: string; label: string };
  cta?: { label: string; href: string };
};

export const JOSH = 'contact@joinvenn.org';
export const DAN = 'dan@quadron.work';

export type DeckWho = { firstName?: string | null };

const first = (w?: DeckWho) => (w?.firstName ?? '').trim().split(/\s+/)[0] ?? '';

/** A mailto link; every value is encoded, and line breaks are CRLF so every mail app keeps them. */
export function mailto(o: { to: string; cc?: string; subject: string; body: string }): string {
  const q = [o.cc ? `cc=${encodeURIComponent(o.cc)}` : '', `subject=${encodeURIComponent(o.subject)}`, `body=${encodeURIComponent(o.body.replace(/\r?\n/g, '\r\n'))}`].filter(Boolean);
  return `mailto:${o.to}?${q.join('&')}`;
}

export function awsEmail(w?: DeckWho): string {
  const n = first(w);
  return mailto({
    to: JOSH,
    subject: 'What I am building (AWS cohort)',
    body: `Hey, this is what I'm building.\n\n[One paragraph that goes a bit deeper: who it is for, what it does, and where it is today.]\n\nHere's one idea I have with AWS: [your idea]\n\n${n}`.trimEnd(),
  });
}

export function quadronEmail(w?: DeckWho): string {
  const n = first(w);
  return mailto({
    to: DAN, cc: JOSH,
    subject: n ? `Hi Dan, I'm ${n}, from Venn's Quadron cohort` : `Hi Dan, from Venn's Quadron cohort`,
    body: `Hi Dan,\n\nI'm ${n || '[your name]'}, in the Venn cohort aligned with Quadron.\n\nHere's what I'm building: [two or three plain sentences].\n\nWhat I'd most like your help with: [one thing].\n\nThanks,\n${n}`.trimEnd(),
  });
}

const rule = (c: string, a: string): DeckSlide => ({
  big: `Say ${c}. Never use its logo.`,
  sub: `This is ${a} ${c}-aligned cohort run by Venn, and ${c} does not sponsor it. No ${c} logo or branding on anything you make or share.`,
});

export function awsDeck(w?: DeckWho): DeckSlide[] {
  return [
    { big: 'Four weeks. Learn, build, show.', sub: 'Venn tells you what comes next at every step.' },
    { big: 'AWS wants people to go from learning to a real job.', sub: 'You will build something that does that for your org.' },
    { big: 'Week one: learn.', sub: 'Take a short course, then hear from an AWS engineer.', video: { src: '/cohorts/aws-engineer.mp4', poster: '/cohorts/aws-engineer-poster.jpg', label: 'An AWS engineer on how startups build with GenAI' } },
    { big: 'Weeks two and three: build one small agent your org really uses.', sub: 'The kind your members would miss if it were gone.' },
    { big: 'Week four: show it.', sub: 'At the end Venn refers the top 10% of the cohort to AWS, picked on effort and impact.' },
    { big: 'We cannot promise you anything from AWS.', sub: 'Orgs that have already built something real are more likely to win a company’s support later, and Venn will vouch for yours.' },
    rule('AWS', 'an'),
    { big: 'Tell Josh what you are building.', sub: 'Josh at Venn is your one point of contact. Send him what you are building and one idea you have with AWS. Please do not write to AWS yourself.', cta: { label: 'Email Josh', href: awsEmail(w) } },
  ];
}

export function quadronDeck(w?: DeckWho): DeckSlide[] {
  return [
    { big: 'Quadron keeps the thinking behind your work.', sub: 'Anyone can build the thing now. The judgment that made it good is what gets lost.' },
    { big: 'You text it while you work.', sub: 'It helps with the decision in front of you, then asks one thing: keep this call?' },
    { big: 'It keeps only what you say Keep.', sub: 'Private by default. You choose what anyone else sees, so you can show it when it counts.' },
    { big: 'Dan wants to meet each of you.', sub: 'Dan at Quadron will talk with you one on one, to understand what you do and how Quadron can help.' },
    { big: 'Four weeks.', sub: 'A kickoff video, a check-in every week, and a short look back at the end.' },
    { big: 'Venn refers the top 10% to Quadron.', sub: 'Picked on effort and impact. It is not a promise from Quadron, and we will not pretend it is.' },
    rule('Quadron', 'a'),
    { big: 'Write to Dan.', sub: 'Tell him who you are and what you are building. Venn is copied, and is still your contact for everything else.', cta: { label: 'Email Dan', href: quadronEmail(w) } },
  ];
}

/** The code deck for a cohort slug, or null so the row's own slides render. */
export function deckFor(slug: unknown, w?: DeckWho): DeckSlide[] | null {
  return slug === 'aws' ? awsDeck(w) : slug === 'quadron' ? quadronDeck(w) : null;
}

