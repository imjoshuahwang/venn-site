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
