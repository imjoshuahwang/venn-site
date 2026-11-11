// Markdown mirrors for agents. Pages and guides are read from the same data the HTML renders, so nothing is written twice.
import { getCollection } from 'astro:content';
import { faq } from '../data/faq';
import { gets as studentGets, how as studentHow } from '../data/students';
import { stats, steps, season, gets as companyGets, rules } from '../data/startups';

export const SITE = 'https://joinvenn.org';
export const NAME = 'Venn';
export const SUMMARY = 'Venn is a selective network of student organizations that companies run programs through. Students apply free every Season and Venn picks a small batch; companies bring a program and a goal and Venn matches it to accepted orgs.';

export type Mirror = { path: string; url: string; title: string; description: string; md: string };

const link = (path: string) => `${SITE}${path}`;
const mdUrl = (path: string) => `${SITE}${path === '/' ? '/index' : path.replace(/\/$/, '')}.md`;

function home(): Mirror {
  const md = `# Venn: the student organization connector

> ${SUMMARY}

Venn is free for students, always. Companies pay Venn. Venn never sells or shares student data.

Venn has worked with 223 partner organizations across 4 batches (3 complete, Fall 2026 in progress). Together they have reached 500,320 students across 21 countries. Fall 2026 drew 350 applications and Venn accepted about 30% of them. Summer 2026 was a five-week season with Microsoft India: nine student organizations reached 58K+ students.

Apply: ${link('/apply')}
For students: ${link('/students')} (markdown: ${mdUrl('/students')})
For companies: ${link('/startups')} (markdown: ${mdUrl('/startups')})
Guides: ${link('/guides/')}
Contact: contact@joinvenn.org

## Questions

${faq.map(([q, a]) => `### ${q}\n\n${a}`).join('\n\n')}
`;
  return { path: '/', url: link('/'), title: 'Venn: the student organization connector', description: 'What Venn is, who it is for and how to apply.', md };
}

function students(): Mirror {
  const md = `# For students: Venn is free, always

> Venn connects students building clubs, nonprofits, projects and startups with college clubs and companies in their field. Companies fund it. You never pay.

Page: ${link('/students')}
Apply: ${link('/apply')}

## What you get

${studentGets.map(([h, p]) => `### ${h}\n\n${p}`).join('\n\n')}

## How picks work

Venn is hard to get into, on purpose.

${studentHow.map(([h, p], i) => `${i + 1}. **${h}.** ${p}`).join('\n')}
`;
  return { path: '/students', url: link('/students'), title: 'For students', description: 'Venn is free for students. What you get and how picks work.', md };
}

function startups(): Mirror {
  const md = `# For companies: run your program through the student orgs that build

> Venn is a selective network of student organizations. You bring a program; Venn matches it, runs it and counts every student it reaches.

Page: ${link('/startups')}
Contact: contact@joinvenn.org

## By the numbers

${stats.map(([n, l]) => `- ${n} ${l}`).join('\n')}

## The problem

Companies want young builders for marketing, early recruiting and CSR. Doing it yourself means finding, vetting and contracting hundreds of groups run by students, many of them minors, then guessing what it did. Orgs apply every Season and only some get in, so the network is made of groups that ship. You get one contract and one contact for all of them.

## How it works

${steps.map(([h, p], i) => `${i + 1}. **${h}.** ${p}`).join('\n')}

## A Season

${season.map(([w, h, p]) => `- ${w}, ${h}: ${p}`).join('\n')}

## What you get

${companyGets.map(([h, p]) => `- **${h}.** ${p}`).join('\n')}

## What Venn will never do

${rules.map((r) => `- ${r}`).join('\n')}

## Next step

One email, one 20-minute call, and a match plan for your program: contact@joinvenn.org
`;
  return { path: '/startups', url: link('/startups'), title: 'For companies', description: 'How companies run programs through Venn: steps, Season timeline, what you get.', md };
}

export async function getGuides() {
  return (await getCollection('guides')).sort((a, b) => +b.data.pubDate - +a.data.pubDate);
}

export function guideMirror(g: Awaited<ReturnType<typeof getGuides>>[number]): Mirror {
  const path = `/guides/${g.id}/`;
  const date = g.data.pubDate.toISOString().slice(0, 10);
  const md = `# ${g.data.title}

> ${g.data.description}

Published ${date} by Joshua Hwang, Venn. Page: ${link(path)}

${(g.body ?? '').trim()}
`;
  return { path, url: link(path), title: g.data.title, description: g.data.description, md };
}

export async function getPages() {
  return [home(), students(), startups()];
}

export const llmsHeader = `# ${NAME}

> ${SUMMARY}

Free for students, always. Companies pay Venn. Venn never sells or shares student data. Contact: contact@joinvenn.org. Every page below has a plain markdown version at the same path with .md.
`;

export async function llmsTxt() {
  const pages = await getPages();
  const guides = (await getGuides()).map(guideMirror);
  const line = (m: Mirror) => `- [${m.title}](${mdUrl(m.path)}): ${m.description}`;
  return `${llmsHeader}
## Pages

${pages.map(line).join('\n')}

## Guides

${guides.map(line).join('\n')}

## Optional

- [Apply](${link('/apply')}): the application form for students
- [Sitemap](${link('/sitemap-index.xml')}): every public page
- [Full text of this site](${link('/llms-full.txt')}): all pages and guides in one file
`;
}

export async function llmsFullTxt() {
  const pages = await getPages();
  const guides = (await getGuides()).map(guideMirror);
  const bump = (md: string) => md.replace(/^(#{1,5}) /gm, '#$1 ');
  const section = (m: Mirror) => `<!-- source: ${m.url} -->\n\n${bump(m.md).trim()}`;
  return `${llmsHeader}
${[...pages, ...guides].map(section).join('\n\n---\n\n')}
`;
}

export { mdUrl };
