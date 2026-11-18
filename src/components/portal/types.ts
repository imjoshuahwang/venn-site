// The shape public.portal_me() returns (supabase/migrations/20261118045934_portal_v1.sql).
export type Peer = { match_id: number; name: string; org: string | null; building: string | null; why: string | null; me_down: boolean; both_down: boolean; email: string | null };
export type Track = { name: string; company: string | null; goal: string | null; criteria: string | null; timeline: string | null; video_url: string | null; slides_url: string | null; prompts: string | null };
export type Outcome = 'cohort' | 'peer' | 'network_waitlist' | 'track_waitlist' | 'not_this_season';
export type Result = { outcome: Outcome; why?: string | null; outlet: string | null; viewed: boolean; track: Track | null; peers: Peer[] };
export type Me = { application: boolean; first_name?: string; org?: string | null; result?: Result | null };

/** Hidden fields for a form on the update page. The live page posts; the demo page swaps in GET links to itself. */
export type FormFor = (action: 'view' | 'down', match?: number) => { action?: string; method: 'get' | 'post'; fields: Record<string, string> };
