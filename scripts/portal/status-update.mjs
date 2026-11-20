// Status-update email DRY RUN (#110). Reads applicants, prints up to 5 sample renders. Sends nothing: there is no send path here.
// Usage: node scripts/portal/status-update.mjs [--target local|preview]
import { readFileSync, writeFileSync } from 'node:fs';

const TEMPLATE = new URL('../../supabase/templates/status-update.html', import.meta.url);
const LINK_RE = /https:\/\/joinvenn\.org\/portal\/auth\/callback\?token_hash=\{\{ \.TokenHash \}\}/;
export const SAMPLE_LINK = 'https://joinvenn.org/portal/auth/callback?token_hash=SAMPLE-SINGLE-USE';

export function eligible(rows) { return rows.filter((r) => r.is_test === false); }
export function pickSamples(rows, n = 5) { return eligible(rows).slice(0, Math.min(n, 5)); }

export function render(template, { name }) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return template.replace(LINK_RE, SAMPLE_LINK).replace('{{ .Name }}', esc(name));
}

export async function dryRun({ fetchRows, template = readFileSync(TEMPLATE, 'utf8'), log = console.log }) {
  const samples = pickSamples(await fetchRows());
  for (const s of samples) log(`--- sample: ${s.email}\n${render(template, { name: s.name })}`);
  log(`dry run: ${samples.length} sample(s) printed, nothing sent`);
  return samples;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  if (argv.includes('--write-preview')) {
    writeFileSync(new URL('../../supabase/templates/status-update.preview.html', import.meta.url), render(readFileSync(TEMPLATE, 'utf8'), { name: 'Alex' }));
    process.exit(0);
  }
  const { resolveTarget } = await import('./users.mjs');
  const target = argv.includes('--target') ? argv[argv.indexOf('--target') + 1] : 'local';
  const t = resolveTarget({ target, env: process.env });
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(t.url, t.key, { auth: { persistSession: false, autoRefreshToken: false } });
  await dryRun({
    fetchRows: async () => {
      const { data, error } = await sb.from('applications').select('name,email,is_test').eq('is_test', false).limit(5);
      if (error) throw new Error(error.message);
      return data;
    },
  });
}
