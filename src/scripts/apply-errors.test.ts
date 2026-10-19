import test from 'node:test';
import assert from 'node:assert/strict';
import { capMessage } from './apply-errors.ts';

const body = (hint: string, message = 'x') => JSON.stringify({ code: 'P0001', message, hint, details: null });

test('rate hints map to specific messages', () => {
  assert.match(capMessage(429, body('rate_email')), /already applied with this email today/);
  assert.match(capMessage(400, body('rate_ip')), /network applied in the last hour/);
  assert.match(capMessage(400, body('rate_global')), /Your answers are still here/);
});

test('constraint and validation errors', () => {
  assert.match(capMessage(400, JSON.stringify({ code: '23514', message: 'violates check constraint "applications_name_plain"' })), /just your name/);
  assert.match(capMessage(400, JSON.stringify({ code: '23514', message: 'violates check constraint "applications_email_shape"' })), /email/);
  assert.match(capMessage(400, JSON.stringify({ code: '22023', message: 'email looks invalid' })), /Check your email/);
});

test('other 4xx is the generic text', () => {
  assert.match(capMessage(400, body('', 'name and working_on are required')), /contact@joinvenn\.org/);
  assert.match(capMessage(404, 'not json'), /contact@joinvenn\.org/);
});

test('no status or 5xx is the connection text; bad bodies never throw', () => {
  assert.match(capMessage(undefined, ''), /Couldn't reach Venn/);
  assert.match(capMessage(503, body('rate_email')), /Couldn't reach Venn/);
  assert.match(capMessage(400, '{not json'), /contact@joinvenn\.org/);
  assert.match(capMessage(400, 'null'), /contact@joinvenn\.org/);
});
