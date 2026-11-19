import type { TeamRow } from './api';

export const TEAM_MAX = 3;
export const STATE_WORDS = ['invited', 'signed in', 'consented', 'waiting on parent'];

export type TeamMemberView = { id: number; email: string; label: string; isMe: boolean };
export type TeamViewModel = { stage: 'empty' | 'list'; members: TeamMemberView[]; canAdd: boolean; canRemove: boolean; seatsLeft: number };

/** Pure view-model for the Team section. Only the lead can add or remove; the cap is 3 live members. */
export function teamView(rows: TeamRow[]): TeamViewModel {
  const lead = rows.some((r) => r.lead_is_me);
  return {
    stage: rows.length ? 'list' : 'empty',
    members: rows.map((r) => ({ id: r.member_id, email: r.email, label: r.state, isMe: r.is_me })),
    canAdd: lead && rows.length < TEAM_MAX,
    canRemove: lead,
    seatsLeft: Math.max(0, TEAM_MAX - rows.length),
  };
}
