// Text Josh stub (#132): pick the channel from the phone's country code and build the prefilled link. No network, no verification.
export type Channel = 'sms' | 'whatsapp';

/** "+1 (415) 555-0123" -> "+14155550123"; null unless it has a + country code and 7-15 digits. */
export function normalizePhone(raw: string): string | null {
  const p = raw.replace(/[\s().-]/g, '');
  return /^\+[1-9]\d{6,14}$/.test(p) ? p : null;
}

/** +1 means iMessage/SMS, anything else WhatsApp; the "I use WhatsApp" toggle forces WhatsApp. */
export const channelFor = (phone: string, whatsapp: boolean): Channel => (!whatsapp && phone.startsWith('+1') ? 'sms' : 'whatsapp');

export const textLine = (firstName: string, code: string): string => `Hi Josh, it's ${firstName.trim()}, ${code}`;

/** The pill's href, or null when Josh's number (env PORTAL_JOSH_PHONE) is not configured. iOS sms wants "&body=", others "?body=". */
export function textHref(o: { channel: Channel; josh: string; line: string; ua: string }): string | null {
  const digits = o.josh.replace(/\D/g, '');
  if (!digits) return null;
  const body = encodeURIComponent(o.line);
  if (o.channel === 'whatsapp') return `https://wa.me/${digits}?text=${body}`;
  return `sms:+${digits}${/iPhone|iPad|iPod/.test(o.ua) ? '&' : '?'}body=${body}`;
}

/** Josh's number from env PORTAL_JOSH_PHONE; empty (pill stays disabled) when unset or not a phone. Never hardcoded. */
export function joshPhone(env: Record<string, string | undefined>): string {
  return normalizePhone((env.PORTAL_JOSH_PHONE ?? '').trim()) ?? '';
}

/** Everything the pill needs from raw field values; QA reads this as data-href. Null keeps the pill disabled. */
export function pillHref(o: { firstName: string; code: string; phone: string; whatsapp: boolean; josh: string; ua: string }): string | null {
  const p = normalizePhone(o.phone);
  if (!p || !o.code) return null;
  return textHref({ channel: channelFor(p, o.whatsapp), josh: o.josh, line: textLine(o.firstName, o.code), ua: o.ua });
}

/** Props for the Text Josh section: locked only for an under-18 whose parent has not signed; a saved phone and code prefill it so the pill is live. */
export function textJoshState(o: { under18: boolean | null; parentSigned: boolean | null; phone: string | null; code: string | null }) {
  return { locked: o.under18 === true && o.parentSigned !== true, phone: o.phone ?? '', code: o.code ?? '' };
}
