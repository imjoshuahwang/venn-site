import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The mail paths must never log an address. Static scan of every log call in these files.
const FILES = ['src/lib/portal/mail.ts', 'scripts/portal/send-results.mjs', 'supabase/functions/send-confirmation/handler.ts',
  'supabase/functions/unsubscribe/handler.ts', 'supabase/functions/resend-webhook/handler.ts'];
for (const f of FILES) {
  test(`${f} logs no email address`, () => {
    const lines = readFileSync(f, 'utf8').split('\n').filter((l) => /console\.(log|error|warn)\(|\blog\(|\)\(`/.test(l));
    for (const l of lines) assert.doesNotMatch(l, /@[a-z0-9.-]+\.[a-z]{2,}|\.email\b|\$\{(to|email|parent_email)\}|applications\.email/i, l);
  });
}
