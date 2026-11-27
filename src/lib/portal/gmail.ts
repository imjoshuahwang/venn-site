export const MENTOR_TO = 'contact@joinvenn.org';
export const MENTOR_CC = 'imjoshuahwang@gmail.com';

/** Gmail web compose URL. Every value goes through encodeURIComponent so & and newlines survive. */
export function gmailComposeUrl(o: { subject: string; body: string; to?: string; cc?: string }): string {
  const e = encodeURIComponent;
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${e(o.to ?? MENTOR_TO)}&cc=${e(o.cc ?? MENTOR_CC)}&su=${e(o.subject)}&body=${e(o.body)}`;
}

/** mailto: fallback with the same to, cc, subject and body as the Gmail URL. */
export function mailtoUrl(o: { subject: string; body: string; to?: string; cc?: string }): string {
  const e = encodeURIComponent;
  return `mailto:${o.to ?? MENTOR_TO}?cc=${e(o.cc ?? MENTOR_CC)}&subject=${e(o.subject)}&body=${e(o.body)}`;
}
