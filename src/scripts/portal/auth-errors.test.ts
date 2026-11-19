import test from 'node:test';
import assert from 'node:assert/strict';
import { authMessage, safeRedirect } from './auth-errors.ts';

const e = (code: string, message = 'raw supabase text', status = 400) => ({ code, message, status });

test('wrong password', () => {
  assert.match(authMessage(e('invalid_credentials', 'Invalid login credentials')), /email or password/i);
});
test('expired or invalid link', () => {
  assert.match(authMessage(e('otp_expired')), /link.*(expired|used)/i);
  assert.match(authMessage({ message: 'Email link is invalid or has expired', status: 403 }), /link.*(expired|used)/i);
});
test('weak password', () => {
  assert.match(authMessage(e('weak_password')), /at least 8/i);
});
test('rate limit', () => {
  assert.match(authMessage(e('over_request_rate_limit', 'x', 429)), /too many|wait/i);
  assert.match(authMessage({ message: 'x', status: 429 }), /too many|wait/i);
});
test('same password', () => {
  assert.match(authMessage(e('same_password')), /different/i);
});
test('unknown error is generic with the contact address and never leaks raw text', () => {
  assert.match(authMessage(e('database_exploded', 'SELECT * FROM auth.users failed at 10.0.0.4', 500)), /contact@joinvenn\.org/);
  for (const code of ['invalid_credentials', 'otp_expired', 'weak_password', 'over_request_rate_limit', 'same_password', 'nope']) {
    assert.doesNotMatch(authMessage(e(code, 'LEAK-ME')), /LEAK-ME/);
  }
  assert.match(authMessage(null), /contact@joinvenn\.org/);
  assert.match(authMessage('string'), /contact@joinvenn\.org/);
});

test('safeRedirect defaults to /portal and keeps same-origin paths', () => {
  assert.equal(safeRedirect(null), '/portal');
  assert.equal(safeRedirect(''), '/portal');
  assert.equal(safeRedirect('/portal/set-password'), '/portal/set-password');
  assert.equal(safeRedirect('/portal?a=1'), '/portal?a=1');
});
test('safeRedirect rejects open-redirect tricks', () => {
  for (const bad of ['//evil.com', 'https://evil.com', 'http://evil.com/portal', '/\\evil.com', '\\\\evil.com', '/\\/evil.com', 'javascript:alert(1)', 'evil.com', '/\t/evil.com', '/\n/evil.com']) {
    assert.equal(safeRedirect(bad), '/portal', JSON.stringify(bad));
  }
});
