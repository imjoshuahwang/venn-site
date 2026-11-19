// Consent clauses for the portal ceremony (#127). Draft copy from Josh's round-4 decisions on #112.
// Bump CONSENT_VERSION whenever the wording changes; give_consent stores answers per version.
export const CONSENT_VERSION = '2026-11-v1';

export type ConsentClause = { key: string; label: string; text: string; required: boolean; default: boolean };

export const CONSENT_CLAUSES: ConsentClause[] = [
  {
    key: 'coordinator_groups',
    label: 'Venn-run groups',
    text: 'All contact with partners runs through Venn-run groups. No private DMs or off-platform asks between students and partners.',
    required: true,
    default: false,
  },
  {
    key: 'highlights',
    label: 'Highlights',
    text: 'Venn may show your first name, school and project results on the site and socials.',
    required: false,
    default: true,
  },
  {
    key: 'full_name_photo',
    label: 'Full name and photo',
    text: 'Venn may show your full name or photo, only because you said yes here.',
    required: false,
    default: false,
  },
  {
    key: 'data_use',
    label: 'How we use your data',
    text: 'We use your answers to match you, run the season and contact you about Venn. Your info is shared with your partner only for your Cohort, and never sold. AI may help read applications. Anonymized aggregate stats may appear in Venn reports and grant applications.',
    required: true,
    default: false,
  },
  {
    key: 'retention',
    label: 'How long we keep it',
    text: 'We keep your info until you ask us to delete it. There is no auto purge. To delete, email contact@joinvenn.org.',
    required: true,
    default: false,
  },
];
