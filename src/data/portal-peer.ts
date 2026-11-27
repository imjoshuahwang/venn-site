export const PEER_COPY = {
  heading: 'Your Peer',
  pill: "I'd be down",
  waiting: 'You are down. Waiting on them.',
  retry: 'That did not go through. Try again.',
  both: 'You are both down. Venn will introduce you by email from contact@joinvenn.org.',
  notIn: 'You are not in a cohort this season, and we know that is not the news you hoped for. Seats were few, so we matched you with one other builder whose work fits yours, so you are not doing this season alone.',
  notInTwo: 'You are not in a cohort this season, and we know that is not the news you hoped for. Seats were few, so we matched you with two other builders whose work fits yours, so you are not doing this season alone.',
  whyLabel: 'Why you two',
  relay: 'If you both want to meet, Venn makes the introduction for you. We never share anyone\'s contact details directly, so write to contact@joinvenn.org if you have a question.',
} as const;

export type PeerRow = {
  match_id: number;
  first_name?: string;
  project?: string;
  place?: string;
  why_matched?: string;
  mine_down?: boolean;
  theirs_down?: boolean;
  contact?: PeerContact;
};
export type PeerContact = { name?: string; email?: string; phone?: string };
export type PeerState = 'none' | 'mine' | 'theirs' | 'both';

export function stateOf(r: { mine_down?: boolean; theirs_down?: boolean }): PeerState {
  const m = !!r.mine_down;
  const t = !!r.theirs_down;
  return m && t ? 'both' : m ? 'mine' : t ? 'theirs' : 'none';
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * The only shape a Peer page sees. Card fields are whitelisted by name, so extra row keys (last name,
 * school, photo, socials, contact) can never leak. Contact comes from the peer_down return value, and only when both are down.
 */
export function peerView(row: PeerRow, contact?: PeerContact | null) {
  const state = stateOf(row);
  const card = { firstName: text(row.first_name), project: text(row.project), place: text(row.place), why: text(row.why_matched) };
  const stage = state === 'both' ? 'both' : state === 'mine' ? 'waiting' : 'none';
  const view: { stage: 'none' | 'waiting' | 'both'; matchId: number; card: typeof card; contact?: { name: string; email: string; phone: string } } = { stage, matchId: row.match_id, card };
  if (stage === 'both' && contact) view.contact = { name: text(contact.name), email: text(contact.email), phone: text(contact.phone) };
  return view;
}
