// Regenerates the match mail previews and the edge function's templates.json from supabase/templates/match-*.html.
// Run: node scripts/match/templates.mjs   (a test fails when the committed outputs are stale)
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../../supabase/templates/', import.meta.url);
export const KINDS = ['request', 'reminder', 'intro', 'declined', 'expired'];
export const SAMPLE = {
  Name: 'Alex', Requester: 'Sam', Org: 'Westview Robotics', Message: 'I saw your project on low-cost water sensors. I am building something similar and would love to compare notes.',
  Link: 'https://joinvenn.org/intro/SAMPLE-SINGLE-USE', StopLink: 'https://joinvenn.org/intro/SAMPLE-SINGLE-USE?stop=1',
  A: 'Alex', B: 'Sam', RematchLink: 'https://joinvenn.org/portal/match',
};
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const render = (tpl) => tpl.replace(/\{\{ \.(\w+) \}\}/g, (_, k) => esc(SAMPLE[k]));
export const read = (k) => readFileSync(new URL(`match-${k}.html`, dir), 'utf8');
export const templatesJson = () => JSON.stringify(Object.fromEntries(KINDS.map((k) => [k, read(k)])), null, 2) + '\n';
export const JSON_PATH = new URL('../../supabase/functions/match-sweep/templates.json', import.meta.url);

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const k of KINDS) writeFileSync(new URL(`match-${k}.preview.html`, dir), render(read(k)));
  writeFileSync(JSON_PATH, templatesJson());
}
