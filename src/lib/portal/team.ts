import type { TeamRow } from './api';

export const TEAM_MAX = 3;

export type TeamMemberView = { id: number; email: string; label: string; isMe: boolean };
export type TeamViewModel = { members: TeamMemberView[]; canAdd: boolean; canRemove: boolean };

/** Pure view-model for the Team section. Only the lead can add or remove; the cap is 3 live members.
 *  A lead with no members arrives as one row with a null member_id, so lead status never rides on member rows. */
export function teamView(rows: TeamRow[]): TeamViewModel {
  const lead = rows.some((r) => r.lead_is_me);
  const members = rows.filter((r) => r.member_id != null).map((r) => ({ id: r.member_id!, email: r.email, label: r.state, isMe: r.is_me }));
  return { members, canAdd: lead && members.length < TEAM_MAX, canRemove: lead };
}
