// Next-steps page copy, keyed by partner (#228, #229). An unknown or missing partner gets the neutral Venn entry, never AWS.
export const TRADEMARK_NOTICE = 'Amazon Web Services, AWS and the AWS logo are trademarks of Amazon.com, Inc. or its affiliates.';

export interface NextStepsConfig {
  partner: string;
  steps: [string, string];
  legal: string[];
  prompts: string[];
  subject: string;
  logo?: string;
  done: { title: string; lead: string; next: [string, string] };
}

const AWS_PROMPTS = [
  'What is your organization?',
  'What event or competition do you want to run?',
  'What is your timeline?',
  'What help do you need from us?',
];
const DONE: NextStepsConfig['done'] = {
  title: "You're in",
  lead: 'Both steps are done. Here is what happens next.',
  next: ['A Venn team member will message you on WhatsApp.', 'Then your cohort kickoff.'],
};

export const NEXT_STEPS: Record<string, NextStepsConfig> = {
  aws: {
    partner: 'aws',
    steps: ['Logistics and legal', 'Email your mentor'],
    legal: [
      "You can't use the AWS logo in your own slides or local promotions.",
      'AWS staff worked directly with Venn to shape the courses so they line up with AWS. This is an informal association, not an official deal with AWS.',
      TRADEMARK_NOTICE,
    ],
    prompts: [
      'What is your organization?',
      'What event or competition do you want to run?',
      'What is your timeline?',
      'What help do you need from us?',
    ],
    subject: 'Venn x AWS Fall Cohort 2026: hello from my organization',
    done: {
      title: "You're in",
      lead: 'Both steps are done. Here is what happens next.',
      next: ['A Venn team member will message you on WhatsApp.', 'Then your cohort kickoff.'],
    },
  },
  quadron: {
    partner: 'quadron',
    steps: ['Logistics and legal', 'Email your mentor'],
    logo: '/logos/quadron.svg',
    legal: [
      "You can't use the Quadron logo in your own slides or local promotions.",
      'This is an informal association between Venn and Quadron, not an official, paid or corporate deal.',
    ],
    prompts: AWS_PROMPTS,
    subject: 'Venn x Quadron Fall Cohort 2026: hello from my organization',
    done: DONE,
  },
  venn: {
    partner: 'venn',
    steps: ['Logistics and legal', 'Email your mentor'],
    legal: ['Your Venn mentor will walk you through the details.'],
    prompts: AWS_PROMPTS,
    subject: 'Venn Fall Cohort 2026: hello from my organization',
    done: DONE,
  },
};

export function nextStepsFor(partner: string | null | undefined): NextStepsConfig {
  return partner != null && Object.hasOwn(NEXT_STEPS, partner) ? NEXT_STEPS[partner] : NEXT_STEPS.venn;
}
