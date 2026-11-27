// Match stage numbers (#247). Every value comes from venn-facts.md in the venn repo (~/venn/venn-facts.md); change it there first.
export const MATCH_FACTS = { orgs: 223, countries: 21, students: 500320 } as const;

export const searchLine = (f = MATCH_FACTS) =>
  `Searching ${f.orgs} partner organizations across ${f.countries} countries, reaching ${f.students.toLocaleString('en-US')} students`;
