import type { APIRoute } from 'astro';
import { render as renderResults, renderNts, linkFor, nextLink } from '../../../../../scripts/portal/send-results.mjs';
import { render as renderStatus } from '../../../../../scripts/portal/status-update.mjs';
import { render as renderMatch } from '../../../../../scripts/match/templates.mjs';
import { sendParentLink } from '../../../../lib/portal/mail';
import confirmation from '../../../../../supabase/functions/send-confirmation/template.json';
import resultsReady from '../../../../../supabase/templates/results-ready.html?raw';
import resultsNts from '../../../../../supabase/templates/results-not-this-season.html?raw';
import statusUpdate from '../../../../../supabase/templates/status-update.html?raw';
import invite from '../../../../../supabase/templates/invite.html?raw';
import magicLink from '../../../../../supabase/templates/magic-link.html?raw';
import recovery from '../../../../../supabase/templates/recovery.html?raw';
import templates from '../../../../../supabase/functions/match-sweep/templates.json';

export const prerender = false;
const auth = (tpl: string) => tpl.replaceAll('{{ .TokenHash }}', 'fixturetoken1234');
const pre = (s: string) => `<pre style="white-space:pre-wrap;font:16px/1.5 system-ui;padding:16px">${s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))}</pre>`;
// The parent consent mail is text only: capture what sendParentLink would POST to Resend, send nothing.
async function parent() {
  let body = '';
  await sendParentLink('contact+portal-parent@joinvenn.org', 'https://joinvenn.org/portal/parent/fixture-token', { apiToken: 'x', fetch: (async (_u: string, i: RequestInit) => { body = String(i.body); return new Response(null, { status: 200 }); }) as typeof fetch });
  const m = JSON.parse(body);
  return pre(`Subject: ${m.subject}\n\n${m.text}`);
}
// send-confirmation's fill() is not exported (Deno edge function): its three placeholders are filled here.
const confirm = () => confirmation.html.replaceAll('{{headline}}', 'You are on the list').replaceAll('{{refer_link}}', 'https://joinvenn.org/refer?r=fixture').replaceAll('{{deadline}}', 'Sunday');
const EMAIL: Record<string, () => string | Promise<string>> = {
  'results-ready': () => renderResults(resultsReady, { name: 'Maya Okafor', link: linkFor('fixturetoken1234', 'invite') }).html,
  'results-not-this-season': () => renderNts(resultsNts, { name: 'Maya Okafor', link: nextLink('fixture-open') }).html,
  invite: () => auth(invite), 'magic-link': () => auth(magicLink), recovery: () => auth(recovery),
  'status-update': () => renderStatus(statusUpdate, { name: 'Maya' }),
  ...Object.fromEntries(Object.keys(templates).map((k) => [`match-${k}`, () => renderMatch((templates as Record<string, string>)[k])])),
  confirmation: confirm, 'parent-consent': parent,
};

export const GET: APIRoute = async ({ params }) => {
  if (!import.meta.env.DEV) return new Response(null, { status: 404 });
  const r = EMAIL[params.name ?? ''];
  if (!r) return new Response(null, { status: 404 });
  return new Response(await r(), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
};
