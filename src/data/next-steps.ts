// Next-steps page copy, keyed by partner (#228). Quadron is added by #229: add a 'quadron' entry below.
export const TRADEMARK_NOTICE = 'Amazon Web Services, AWS and the AWS logo are trademarks of Amazon.com, Inc. or its affiliates.';

export interface NextStepsConfig {
  partner: string;
  steps: [string, string];
  legal: string[];
  prompts: string[];
  subject: string;
  logo?: string;
}

export const NEXT_STEPS: Record<string, NextStepsConfig> = {
  aws: {
    partner: 'aws',
    steps: ['Logistics and legal', 'Email your mentor'],
    legal: [
      'Clubs may not use the AWS logo.',
      'The curriculum is aligned to AWS and comes from real AWS staff.',
      TRADEMARK_NOTICE,
    ],
    prompts: [
      'What is your organization?',
      'What event or competition do you want to run?',
      'What is your timeline?',
      'What help do you need from us?',
    ],
    subject: 'Venn x AWS Fall Cohort 2026: hello from my organization',
  },
  // quadron: filled by #229 (logo, Dan Pyle note, bio, pratl.me).
};

export function nextStepsFor(partner: string | null | undefined): NextStepsConfig {
  return NEXT_STEPS[partner ?? ''] ?? NEXT_STEPS.aws;
}
