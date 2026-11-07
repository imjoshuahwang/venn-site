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
    blurb: 'Own your category for a full Season.',
    features: [
      'Category exclusivity for the Season',
      '15 to 20 orgs and a program lead',
      'Weekly updates and a Season report',
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
    blurb: 'One program across five orgs.',
    features: [
      '5 orgs matched to your program',
      'One Venn contact start to finish',
      'A report at Season end',
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
    blurb: 'Pay only for students who opt in.',
    features: [
      'Priced on reach, never a list',
      'Orgs picked for fit',
      'A reach count and short report',
    ],
    cta: 'Pay for reach',
    checkout: '',
  },
] as const;

// Low to high on every page.
export const tiers = [...highToLow].reverse();

export const usd = (n: number) => '$' + n.toLocaleString('en-US');
