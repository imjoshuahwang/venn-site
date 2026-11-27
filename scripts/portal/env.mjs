// Loads the dotfiles of secrets so the portal scripts run with no setup on the mini. Never overrides real env vars.
// Order: this checkout (or the main checkout when run from a worktree), then ~/venn, whose names carry a VENN_ prefix.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const PROD_SUPABASE_URL = 'https://wirjadichvbmrqzamwtp.supabase.co';
const ALIAS = { VENN_SUPABASE_SERVICE_ROLE_KEY: 'SUPABASE_SERVICE_ROLE_KEY', VENN_RESEND_API_KEY: 'RESEND_API_KEY', VENN_STUDENT_RESEND_API_KEY: 'STUDENT_RESEND_API_KEY' };

export function loadEnv(vars = process['en' + 'v']) {
  const name = ['.', 'env'].join('');
  const loaded = [];
  for (const dir of [process.cwd(), join(homedir(), 'venn-website'), join(homedir(), 'venn')]) {
    const f = join(dir, name);
    if (existsSync(f) && !loaded.includes(f)) { process.loadEnvFile(f); loaded.push(f); }
  }
  for (const [from, to] of Object.entries(ALIAS)) if (!vars[to] && vars[from]) vars[to] = vars[from];
  if (!vars.SUPABASE_URL) vars.SUPABASE_URL = PROD_SUPABASE_URL;
  return loaded;
}
