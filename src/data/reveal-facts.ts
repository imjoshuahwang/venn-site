// Reveal stat line (#226). Every value comes from venn-facts.md in the venn repo (~/venn/venn-facts.md); change it there first.
export const REVEAL_FACTS = {
  students: 500320,
  countries: 21,
  pastWork: ['Microsoft', 'Yale', 'Stanford', 'Harvard', 'Princeton', 'UC Berkeley'],
} as const;

export const STOOD_OUT = 'But you stood out.';

const list = (xs: readonly string[]) => `${xs.slice(0, -1).join(', ')}, and ${xs.at(-1)}`;

/** One flowing sentence. The acceptance rate is "about" because the facts file says about 30%. */
export function statLine(f = REVEAL_FACTS): string {
  return `Venn has reached ${f.students.toLocaleString('en-US')} students across ${f.countries} countries and has worked with ${list(f.pastWork)}.`;
}
