// Batch 1 cohort slideshows (#185): the source for cohorts.slides on the AWS and Quadron rows, rendered by CohortSlides.
// Both cohorts are aligned with a company and never sponsored by it; the company name appears as text only, never a logo.
export type CohortSlide = { title: string; body: string };

const rule = (c: string, a: string): CohortSlide => ({
  title: 'The rule you must follow',
  body: `This is ${a} ${c}-aligned cohort run by Venn, and it is not sponsored by ${c}. You can write ${c} in words, but never use the ${c} logo or any ${c} branding in anything you make or share.`,
});

const contact: CohortSlide = {
  title: 'Who to talk to',
  body: 'All communication goes through contact@joinvenn.org, so write there with any question, idea or problem and Venn will answer or pass it along. Please do not contact the company yourself.',
};

const whyItMatters = (c: string, what: string): CohortSlide => ({
  title: 'Why it matters',
  body: `We cannot guarantee you anything from ${c}, and we will not pretend otherwise. What we can say is that an org that has already run something ${what} is more likely to win that company's support later.`,
});

const vouch = (c: string): CohortSlide => ({
  title: 'How Venn backs you',
  body: `Venn will vouch that your work was part of a Venn cohort, and at the end Venn will refer the top 10% of the cohort to ${c}, chosen on the quality of your engagement and the impact of what you did.`,
});

export const AWS_SLIDES: CohortSlide[] = [
  { title: 'Your four weeks', body: 'In week 1 you take a short course and watch a video from an AWS engineer, in weeks 2 and 3 you build, and in week 4 you show what you made, with Venn pacing each step and telling you what comes next.' },
  { title: 'What AWS cares about', body: 'AWS puts much of its public community work behind helping people go from learning to a real job, through free cloud and AI courses, skills training for students and career changers, and education programs with schools and nonprofits.' },
  { title: 'What you will do', body: 'With Venn you will come up with one event or build for your org that fits those values, and you will ship one small agent that your org actually uses, the kind your members would miss if it were gone.' },
  whyItMatters('AWS', 'in line with its values'),
  vouch('AWS'),
  rule('AWS', 'an'),
  contact,
];

export const QUADRON_SLIDES: CohortSlide[] = [
  { title: 'Your four weeks', body: 'In week 1 you watch a kickoff video, every week after that you have a check-in, and in week 4 you wrap up with a short look back at what you did, with Venn pacing each step.' },
  { title: 'What Quadron looks for', body: 'Quadron wants orgs whose members think in public, the builders, researchers and founders who share how they reason as they go and not only what they finished.' },
  { title: 'What you will do', body: 'You will work directly with the Quadron team over the four weeks, which means talking with them, showing how your org thinks, and trying what they are building, with Venn keeping it organized.' },
  whyItMatters('Quadron', 'aligned with what a company is building'),
  vouch('Quadron'),
  rule('Quadron', 'a'),
  contact,
];

/** The SQL that sets both rows; additive, so it only fills a null slides column. */
export function slidesSql(): string {
  const q = (s: CohortSlide[]) => JSON.stringify(s).replace(/'/g, "''");
  return [['aws', AWS_SLIDES], ['quadron', QUADRON_SLIDES]]
    .map(([slug, s]) => `update public.cohorts set slides = '${q(s as CohortSlide[])}'::jsonb where slug = '${slug}' and slides is null;`)
    .join('\n');
}
