// Turns qa/out/report.json into ONE markdown PR comment, upserted by a hidden marker.
// CLI: node scripts/qa/pr-comment.mjs [--report qa/out/report.json] [--url URL] [--run-url URL] [--pr N] [--print]
// Env fallbacks: PREVIEW_URL, RUN_URL, PR_NUMBER, GITHUB_REPOSITORY, GITHUB_SHA.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const MARKER = '<!-- mobile-qa -->';
const TOP = 10;

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

export function buildComment(results, { url = '', runUrl = '' } = {}) {
  const fails = results.filter((r) => !r.pass);
  const devices = [...new Set(results.map((r) => r.device))];
  const pages = [...new Set(results.map((r) => r.page))].sort();
  const failCount = (p, d) => fails.filter((r) => r.page === p && r.device === d).length;
  const has = (p, d) => results.some((r) => r.page === p && r.device === d);

  const out = [MARKER, `### Mobile QA: ${fails.length ? `${fails.length} failing check${fails.length === 1 ? '' : 's'}` : 'all pass'}`, ''];
  if (url) out.push(`Preview: ${url}`);
  out.push(`${pages.length} pages x ${devices.length} devices, ${results.length} checks.`, '');

  if (results.length) {
    out.push(`| page | ${devices.join(' | ')} |`, `|---|${devices.map(() => ':-:').join('|')}|`);
    for (const p of pages) {
      out.push(`| \`${p}\` | ${devices.map((d) => (!has(p, d) ? '-' : failCount(p, d) ? `fail ${failCount(p, d)}` : 'pass')).join(' | ')} |`);
    }
    out.push('');
  }

  if (fails.length) {
    const sorted = [...fails].sort((a, b) => cmp(a.page, b.page) || cmp(a.device, b.device) || cmp(a.check, b.check));
    out.push(`**Top ${Math.min(TOP, sorted.length)} failures**${sorted.length > TOP ? ` (of ${sorted.length})` : ''}`, '');
    out.push('| page | device | check | details |', '|---|---|---|---|');
    for (const r of sorted.slice(0, TOP)) out.push(`| \`${cell(r.page)}\` | ${cell(r.device)} | ${cell(r.check)} | ${cell(r.details).slice(0, 200)} |`);
    out.push('');
  }

  if (runUrl) out.push(`Report and screenshots: [artifact \`mobile-qa\` on this run](${runUrl}#artifacts)`);
  return out.join('\n').trimEnd() + '\n';
}

// gh(args, input?) -> stdout string. Injected in tests.
const realGh = (args, input) => execFileSync('gh', args, { encoding: 'utf8', input, maxBuffer: 64 << 20 });

export function findPrNumber(gh, repo, sha) {
  const prs = JSON.parse(gh(['api', `repos/${repo}/commits/${sha}/pulls`]) || '[]');
  const open = prs.find((p) => p.state === 'open') || prs[0];
  return open ? open.number : null;
}

export function upsertComment(gh, repo, pr, body) {
  const existing = JSON.parse(gh(['api', '--paginate', '--slurp', `repos/${repo}/issues/${pr}/comments`]) || '[]').flat()
    .find((c) => c.body && c.body.includes(MARKER));
  const payload = JSON.stringify({ body });
  const args = existing
    ? ['api', '-X', 'PATCH', `repos/${repo}/issues/comments/${existing.id}`, '--input', '-']
    : ['api', '-X', 'POST', `repos/${repo}/issues/${pr}/comments`, '--input', '-'];
  const res = JSON.parse(gh(args, payload));
  return { url: res.html_url, updated: Boolean(existing) };
}

function arg(argv, name) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

export async function main(argv = process.argv.slice(2), env = process.env, gh = realGh) {
  const report = arg(argv, 'report') || 'qa/out/report.json';
  const results = JSON.parse(fs.readFileSync(report, 'utf8'));
  const body = buildComment(results, { url: arg(argv, 'url') || env.PREVIEW_URL, runUrl: arg(argv, 'run-url') || env.RUN_URL });
  if (argv.includes('--print')) { process.stdout.write(body); return; }
  const repo = env.GITHUB_REPOSITORY;
  let pr = arg(argv, 'pr') || env.PR_NUMBER;
  if (!pr && repo && env.GITHUB_SHA) pr = findPrNumber(gh, repo, env.GITHUB_SHA);
  if (!pr) { console.log('No PR found for this run; comment not posted.'); return; }
  const { url, updated } = upsertComment(gh, repo, pr, body);
  console.log(`${updated ? 'Updated' : 'Posted'} mobile-qa comment: ${url}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
