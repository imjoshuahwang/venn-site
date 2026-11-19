import test from 'node:test';
import assert from 'node:assert/strict';
import { stubSavePhone } from '../../lib/portal/rpc-adapter.ts';
import { channelFor, textHref, textLine, normalizePhone, joshPhone, pillHref } from './text-link.ts';

test('joshPhone reads PORTAL_JOSH_PHONE and falls back to empty when unset or junk', () => {
  assert.equal(joshPhone({ PORTAL_JOSH_PHONE: ' +16505550100 ' }), '+16505550100');
  assert.equal(joshPhone({}), '');
  assert.equal(joshPhone({ PORTAL_JOSH_PHONE: 'call me' }), '');
});

test('pillHref (the QA data-href) builds the whole link from raw inputs, null until usable', () => {
  const base = { firstName: 'Maya', code: 'VENN-4F2K', josh: '+16505550100', ua: 'iPhone' };
  const enc = encodeURIComponent("Hi Josh, it's Maya, VENN-4F2K");
  assert.equal(pillHref({ ...base, phone: '+1 415 555 0123', whatsapp: false }), `sms:+16505550100&body=${enc}`);
  assert.equal(pillHref({ ...base, phone: '+44 7700 900123', whatsapp: false }), `https://wa.me/16505550100?text=${enc}`);
  assert.equal(pillHref({ ...base, phone: '+1 415 555 0123', whatsapp: true }), `https://wa.me/16505550100?text=${enc}`);
  assert.equal(pillHref({ ...base, phone: '415 555 0123', whatsapp: false }), null);
  assert.equal(pillHref({ ...base, code: '', phone: '+14155550123', whatsapp: false }), null);
  assert.equal(pillHref({ ...base, josh: '', phone: '+14155550123', whatsapp: false }), null);
});

test('stubSavePhone mints one stable VENN-XXXX per session', () => {
  const a = stubSavePhone('+14155550123', false);
  assert.match(a, /^VENN-[A-Z0-9]{4}$/);
  assert.equal(stubSavePhone('+447700900123', true), a);
});

test('normalizePhone keeps a leading + and digits only, null when no country code', () => {
  assert.equal(normalizePhone('+1 (415) 555-0123'), '+14155550123');
  assert.equal(normalizePhone('+44 7700 900123'), '+447700900123');
  assert.equal(normalizePhone('4155550123'), null);
  assert.equal(normalizePhone('+12'), null);
});

test('channelFor: +1 is sms, anything else whatsapp, the toggle forces whatsapp', () => {
  assert.equal(channelFor('+14155550123', false), 'sms');
  assert.equal(channelFor('+447700900123', false), 'whatsapp');
  assert.equal(channelFor('+14155550123', true), 'whatsapp');
});

test('textLine carries first name and code', () => {
  assert.equal(textLine('Maya', 'VENN-4F2K'), "Hi Josh, it's Maya, VENN-4F2K");
});

test('textHref builds sms for iOS and other, and wa.me with digits only', () => {
  const line = "Hi Josh, it's Maya, VENN-4F2K";
  const enc = encodeURIComponent(line);
  assert.equal(textHref({ channel: 'sms', josh: '+1 (650) 555-0100', line, ua: 'iPhone' }), `sms:+16505550100&body=${enc}`);
  assert.equal(textHref({ channel: 'sms', josh: '+16505550100', line, ua: 'Pixel 7 Android' }), `sms:+16505550100?body=${enc}`);
  assert.equal(textHref({ channel: 'whatsapp', josh: '+16505550100', line, ua: 'iPhone' }), `https://wa.me/16505550100?text=${enc}`);
});

test('textHref encodes awkward first names and is null without a Josh number', () => {
  const line = textLine('Zoë & Co #1', 'VENN-AAAA');
  const href = textHref({ channel: 'whatsapp', josh: '+16505550100', line, ua: '' })!;
  assert.ok(href.endsWith(encodeURIComponent(line)));
  assert.ok(!href.includes('&Co') && !href.includes('#1'));
  assert.equal(textHref({ channel: 'sms', josh: '', line, ua: '' }), null);
});
