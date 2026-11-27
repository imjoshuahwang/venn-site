// #286: the one shell every supabase/templates/*.html wears. `node scripts/email/shell.mjs` rewrites them in place.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

export const PREHEADERS = {
  invite: 'Your application was accepted. Set a password to open your portal.',
  'magic-link': 'Your sign-in link for the Venn portal.',
  recovery: 'Choose a new password for your Venn portal.',
  'status-update': 'Your answer from Venn is waiting in your portal.',
  'results-ready': 'Your Venn result is waiting in your portal.',
  'match-request': 'Someone from Venn would like to connect with you.',
  'match-reminder': 'A quick nudge about a connection request.',
  'match-intro': 'You both said yes. Here is the introduction.',
  'match-declined': 'An update on your match.',
  'match-expired': 'An update on your request.',
};

const FONT = '-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif';
const HEAD = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<style>:root{color-scheme:light dark;supported-color-schemes:light dark}@media (prefers-color-scheme: dark){body,.bg{background:#111 !important;color:#f2f2f2 !important}.muted,.muted a,.fb{color:#a8a8a8 !important}.quote{border-left-color:#444 !important;color:#d8d8d8 !important}.btn{background:#fff !important;color:#111 !important;border-color:#fff !important}}</style>
</head><body style="margin:0;background:#fff">`;
const TAIL = '</body></html>\n';

const BTN = /<p style="margin:24px 0"><a href="([^"]+)" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-weight:600;padding:14px 28px;border-radius:999px">([^<]+)<\/a><\/p>/;
const button = (_, url, label) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0"><tr><td><a class="btn" href="${url}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-weight:600;padding:12px 26px;border:2px solid #111;border-radius:999px">${label}</a></td></tr></table>\n<p class="fb" style="color:#666;font-size:13px;word-break:break-all">If the button does not work, paste this link into your browser: ${url}</p>`;

const OPEN = `<div class="bg" style="font-family:${FONT};max-width:480px;margin:0 auto;padding:32px 20px;background:#fff;color:#111;font-size:16px;line-height:1.5">`;

function inner(h) {
  const m = h.match(/<!--body-->\n([\s\S]*?)<!--\/body-->/);
  if (m) return m[1].replace(/<table role="presentation"[\s\S]*?<\/table>\n<p class="fb"[^>]*>If the button does not work[^<]*<\/p>/, (t) => {
    const u = t.match(/<a class="btn" href="([^"]+)" style="[^"]*">([^<]+)<\/a>/);
    return `<p style="margin:24px 0"><a href="${u[1]}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;font-weight:600;padding:14px 28px;border-radius:999px">${u[2]}</a></p>`;
  });
  const lines = h.trim().split('\n');
  return lines.slice(1, -1).join('\n') + '\n';
}

export function render(h, name = 'results-ready') {
  const body = inner(h)
    .replace(BTN, button)
    .replace(/<p style="color:#666;font-size:1[34]px">/g, (t) => t.replace('<p ', '<p class="muted" '))
    .replace(/<blockquote style=/g, '<blockquote class="quote" style=');
  const pre = PREHEADERS[name];
  const hidden = `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${pre}${'&nbsp;&zwnj;'.repeat(40)}</div>`;
  return `${HEAD}\n${hidden}\n${OPEN}\n<!--body-->\n${body}<!--/body-->\n</div>\n${TAIL}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = new URL('../../supabase/templates/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.html'))) {
    const p = new URL(f, dir);
    writeFileSync(p, render(readFileSync(p, 'utf8'), f.replace('.preview', '').replace('.html', '')));
  }
}
