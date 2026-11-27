// Consent v3 for the portal ceremony (#127, #191).
// DRAFT: pending review by Josh's lawyer. Not for the real send until it is signed off ("Lawyer review needed before go-live").
// Bump CONSENT_VERSION whenever the wording changes; give_consent stores answers per version.
// The five clause keys are fixed by the give_consent / consent_state database functions. v3 keeps them:
// the single "Yes, I understand" at the end answers the three required keys, and the two optional keys are the choices on the data page.
export const CONSENT_VERSION = '2026-11-v3';
export const CONSENT_DRAFT = true;

export type ConsentClause = { key: string; label: string; text: string; required: boolean; default: boolean };

export const CONSENT_CLAUSES: ConsentClause[] = [
  {
    key: 'coordinator_groups',
    label: 'The cohort rules',
    text: 'All contact with partners runs through Venn-run groups and contact@joinvenn.org, a cohort is aligned with a company and not sponsored by it, and nobody uses a company logo.',
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
    text: 'We use your answers to match you, run the season and contact you about Venn. Your info is shared with your partner only for your Cohort, and never sold. AI may help read applications.',
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

export type ConsentPage = {
  id: string;
  title: string;
  summary: string;
  body: string[];
  // Optional clause keys shown as choices on this page.
  choices?: string[];
};

export const CONSENT_PAGES: ConsentPage[] = [
  {
    id: 'age',
    title: 'Your age and your parents',
    summary: 'If you are under 18, a parent or guardian has to say yes too, and Venn sends them a link to do it.',
    body: [
      'Venn is open to students of many ages, and a lot of them are under 18. If you are under 18, you need the permission of a parent or legal guardian to take part, and a yes from you alone is not enough.',
      'After you finish these pages we will ask for a parent or guardian email address. We send that person a link to the same terms you are reading now, and your next steps stay on hold until they agree. The link expires after a while, and if it does you can ask us to send a new one.',
      'Use the email of a real adult who looks after you. Please do not use your own second address or a friend\'s, because that would defeat the point of the rule, and it counts as breaking these terms.',
      'If you are 18 or older, you agree for yourself and there is no parent step.',
      'A parent or guardian can ask us at any time to stop using their child\'s information or to delete it, by writing to contact@joinvenn.org.',
    ],
  },
  {
    id: 'aligned',
    title: 'Aligned, not sponsored',
    summary: 'Venn and the companies we work with are aligned with your cohort. They are not sponsors, and you may not say they are.',
    body: [
      'Companies such as AWS and Quadron run programs through Venn. When your cohort is matched with one of them, we say the cohort is aligned with that company, which means the company\'s goals and your work point the same way.',
      'Aligned does not mean sponsored. The company is not paying you or your team, it is not employing you, and it has not endorsed you, your project or your organization. The same is true of Venn: Venn runs the season, but Venn does not sponsor or endorse what you build.',
      'So you may not say, post or imply that a company or Venn sponsors, funds, backs, approves, endorses or officially partners with you or your project. That covers posts, your website, pitch decks, emails, your résumé and anything you say to press or to other students.',
      'You can say what is true, for example that you are in a Venn cohort. If you want to name a company in public, ask contact@joinvenn.org first and we will tell you the wording that is accurate.',
    ],
  },
  {
    id: 'logos',
    title: 'Logos and names',
    summary: 'Do not use any company logo, and do not use the Venn logo unless we give it to you for that exact purpose.',
    body: [
      'Never put a partner company\'s logo, brand marks or product artwork on anything you make. That includes posts, websites, slides, merchandise, email signatures, cover art and event pages, and it includes look-alike versions.',
      'The same goes for the Venn name and logo. You may use them only when Venn gives you a file or approved wording and says what it is for, and only for that one use.',
      'The reason is simple. A logo next to your name tells a stranger that the company vouches for you, and the aligned-not-sponsored rule on the last page says it does not.',
      'If Venn asks you to take something down, you take it down quickly. We ask because an unapproved logo can cause real trouble for you and for the company.',
    ],
  },
  {
    id: 'data',
    title: 'Your data',
    summary: 'We keep what you tell us, only the people who need it see it, we never sell it, and you can ask us to delete it any time.',
    choices: ['highlights', 'full_name_photo'],
    body: [
      'What we store: your application and everything you wrote in it, your name, email, school and level, your results and letters, your cohort and any peer match, your answers to the guiding questions, your team members, the agreements you sign here, your consent choices, and a parent or guardian email if you are under 18. Our sign-in and email tools also keep the technical records they need to work.',
      'Who sees it: the small Venn team sees all of it. Your partner company sees your information only for your cohort and only what the program needs, and contact with them goes through Venn. The services we use to run the portal and send email handle it on our behalf. AI may help read applications. Anonymized numbers that cannot point back to you, such as how many students applied from a country, may appear in Venn reports and grant applications.',
      'What we never do: we never sell your information, and we never hand it to a company for its own marketing.',
      'How long we keep it: until you ask us to delete it. There is no automatic purge. To delete, email contact@joinvenn.org from the address you applied with, or have a parent or guardian write if you are under 18. We look up everything tied to your email, including your application, results, peer matches, signed agreements, consent records, team entries and answers, delete it, and confirm by email when it is done. Anything already published with your permission comes down from our own site and posts, though we cannot take back copies other people already made.',
      'Your choices below are optional, you can say no and still join, and you can change them later from your consent page.',
    ],
  },
  {
    id: 'conduct',
    title: 'How to behave',
    summary: 'Be honest, be kind, do your own work, and keep every conversation with partners inside Venn.',
    body: [
      'Give true information in your application and in the portal, and do your own work. If you use AI or other tools, say so when asked, and do not pass off someone else\'s work as yours.',
      'Treat everyone in the network with respect. No harassment, bullying, hate, threats or sharing of another person\'s private information, and nothing illegal or unsafe.',
      'All contact with partner companies runs through Venn-run groups and contact@joinvenn.org. Do not send private DMs, ask for favors, jobs, money or introductions off-platform, or move a conversation to another app. This protects you, and it matters most for students under 18.',
      'Keep what partners share with you in confidence unless they say you can share it.',
      'If a partner employee or anyone else contacts you privately, makes you uncomfortable or asks you to keep a secret, tell contact@joinvenn.org. You will not be in trouble for reporting.',
      'If you break these rules, Venn may remove you or your team from a cohort or from the network. We will tell you why when we can.',
    ],
  },
  {
    id: 'referral',
    title: 'Referrals',
    summary: 'Venn vouches for your work and refers the top 10% of a cohort to the partner, and promises nothing more than that.',
    body: [
      'At the end of a season Venn picks the strongest work in each cohort, about the top 10%, and refers those students to the partner company. A referral means Venn introduces you, vouches for your work and shares the information the introduction needs, such as your name, school, what you built and a way to reach you through Venn.',
      'Venn decides who is referred and why, using the work you did and how you behaved in the program. Being referred is not a job offer, an interview, an internship or any other deal, and what the company does with an introduction is the company\'s choice.',
      'Venn promises nothing more than the referral. Not being referred says nothing bad about you, and it does not stop you from applying again.',
    ],
  },
  {
    id: 'guarantees',
    title: 'No guarantees',
    summary: 'Joining does not guarantee funding, a job, credits, a mentor or any particular result.',
    body: [
      'Venn is a selective program, and being accepted is a chance to do real work, not a promise of what comes after.',
      'Venn does not guarantee funding or grants, jobs, internships or interviews, cloud credits or free products, mentorship or any amount of a mentor\'s time, press or social attention, a place in a later season, or that your project will grow or succeed.',
      'Programs, partners and perks can change, shrink or end, and a partner company can leave a program. When that happens we will tell you as soon as we reasonably can.',
    ],
  },
  {
    id: 'liability',
    title: 'Limits on Venn\'s responsibility',
    summary: 'Venn does its honest best, but it is a small team and is not responsible for everything that could go wrong.',
    body: [
      'Venn gives you the portal and the program as they are, and we work hard to keep them running and accurate. We cannot promise they will always work, always be available or be free of mistakes.',
      'You are responsible for what you build and publish, for following the law and your school\'s rules, and for your own decisions. Venn is not responsible for what partner companies or other students say or do, for projects you make, or for losses that come from relying on the program, including missed opportunities.',
      'To the fullest extent the law allows, Venn is liable only for direct harm that it causes by breaking these terms, and not for indirect or lost-opportunity losses. Nothing here takes away rights the law says you always keep, and nothing limits liability that the law does not allow to be limited.',
      'If you are under 18, your parent or guardian agrees to these terms for you as well. The version you accept is recorded with your answers.',
    ],
  },
  {
    id: 'confirm',
    title: 'Ready?',
    summary: 'Say yes only if you have read the pages and understood them. You can go back to any page first.',
    body: [
      'By tapping the button below you confirm that you read these pages, that you understood them, and that you agree to them. If you are under 18, you also confirm that you will ask a parent or guardian to agree as the next step.',
      'If anything is unclear, go back, or write to contact@joinvenn.org before you decide.',
    ],
  },
];
