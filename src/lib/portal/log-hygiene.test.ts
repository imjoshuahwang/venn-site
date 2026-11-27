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

// The match migration must not log or notify with addresses: no raise/notice text carrying an email, and no raw token column.
test('matches migration logs no email and stores no raw token', () => {
  const sql = readFileSync('supabase/migrations/20261127020000_matches.sql', 'utf8');
  for (const l of sql.split('\n').filter((x) => /raise (notice|warning|info|log)|\bRAISE\s+EXCEPTION/i.test(x))) assert.doesNotMatch(l, /email|phone|%I|%L/i, l);
  assert.doesNotMatch(sql, /\b(token|raw_token)\s+text\b/i);
});
