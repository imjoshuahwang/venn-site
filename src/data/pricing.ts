// Company pricing. Students never pay. A Stripe Payment Link goes in `checkout` once the
// Stripe account can take payments; until then the button books a call instead.
export const CONTACT = 'mailto:contact@joinvenn.org';

const highToLow = [
  {
    key: 'season',
    name: 'Season',
    price: 20000,
    unit: 'per Season',
    reach: '3,000+ students reached',
    perStudent: '$6.67',
    blurb: 'Own your category for a full Season across 15 to 20 orgs.',
    features: [
      'Category exclusivity: no competitor runs through Venn that Season',
      '15 to 20 accepted orgs matched to your program',
      'A dedicated Venn program lead',
      'Your name on their events, projects and posts',
      'Weekly reach updates and a written Season report',
      'First look at the members as future talent',
    ],
    cta: 'Book a call',
    checkout: '',
  },
  {
    key: 'launch',
    name: 'Launch',
    price: 4900,
    unit: 'one program',
    reach: 'About 500 students reached',
    perStudent: '$9.80',
    blurb: 'One program, five orgs, one Season. The first deal most companies start with.',
    features: [
      '5 accepted orgs matched to your program',
      'One Venn contact for matching, contracts and communication',
      'Your name on their work',
      'A written report at Season end',
    ],
    cta: 'Start a Launch',
    checkout: '',
    popular: true,
  },
  {
    key: 'reach',
    name: 'Reach',
    price: 10,
    unit: 'per student reached',
    reach: '100 to 5,000 students',
    perStudent: '$10',
    blurb: 'Pay only for the students who opt in to your program. Set the number.',
    features: [
      'Priced on students reached, never on a list',
      'Orgs picked from the network for fit',
      'A reach count and a short report',
    ],
    cta: 'Pay for reach',
    checkout: '',
  },
] as const;

// Low to high on every page.
export const tiers = [...highToLow].reverse();

export const usd = (n: number) => '$' + n.toLocaleString('en-US');
