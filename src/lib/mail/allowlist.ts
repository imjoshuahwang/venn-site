// Send allowlist (#280). SEND_ALLOWLIST is a comma list of addresses; `*` inside matches any run of characters in the local part.
// Unset or empty refuses every address (fail closed); `*` alone allows all (the go-live switch). Case-insensitive. Plain TS so Deno and node both import it.
export function sendAllowed(email: string, list: string | undefined): boolean {
  const e = (email ?? '').trim().toLowerCase();
  const rules = (list ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!e || !rules.length) return false;
  return rules.some((r) => {
    if (r === '*') return true;
    if (!r.includes('*')) return r === e;
    const at = r.lastIndexOf('@');
    const ea = e.lastIndexOf('@');
    if (at < 0 || ea < 0 || r.slice(at) !== e.slice(ea) || r.slice(0, at).includes('@')) return false;
    const re = new RegExp('^' + r.slice(0, at).split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    return re.test(e.slice(0, ea));
  });
}

export const NOT_ALLOWLISTED = 'not_allowlisted';
