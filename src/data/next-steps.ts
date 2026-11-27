// Next-steps page copy, keyed by partner (#228). Quadron is added by #229: add a 'quadron' entry below.
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

export const NEXT_STEPS: Record<string, NextStepsConfig> = {
  aws: {
    partner: 'aws',
    steps: ['Logistics and legal', 'Email your mentor'],
    legal: [
      "You can't use the AWS or Quadron logos in your own slides or local promotions.",
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
  // quadron: filled by #229 (logo, Dan Pyle note, bio, pratl.me).
};

export function nextStepsFor(partner: string | null | undefined): NextStepsConfig {
  return partner != null && Object.hasOwn(NEXT_STEPS, partner) ? NEXT_STEPS[partner] : NEXT_STEPS.aws;
}
