// Shared by the e2e specs and qa:portal: every run owns its dev server on a free port, so another worktree's server is never mistaken for ours.
import net from 'node:net';
import { execFileSync } from 'node:child_process';

export function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

// `npx astro dev` forks the real server, so kill the whole process group (spawn it with detached: true) or it outlives the run and squats its port.
export function stopServer(child) {
  if (!child?.pid) return;
  try { process.kill(-child.pid); } catch { child.kill(); }
}

// Parsed `supabase status -o json`, or one clear line saying the stack is not up. Local stack only.
export function supabaseStatus(exec = execFileSync) {
  let out;
  try { out = exec('supabase', ['status', '-o', 'json'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch {
    throw new Error('local Supabase is not running (or the supabase CLI is missing): run `supabase start`, then `node scripts/portal/seed.mjs --yes`, then retry');
  }
  let st;
  try { st = JSON.parse(out.replace(/^[^{]*/, '')); } catch { throw new Error('could not read `supabase status -o json`; is the local stack up? run `supabase start`'); }
  if (!/127\.0\.0\.1|localhost/.test(st.API_URL || '')) throw new Error(`refusing to run against a non-local stack (${st.API_URL})`);
  return st;
}
