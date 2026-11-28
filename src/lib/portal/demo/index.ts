// Demo mode (#318): an in-memory stand-in for Supabase, DEV only. Nothing here touches the network.
// API:
//   OUTCOMES                          the 6 demo outcomes: cohort-aws, cohort-quadron, peer, network_waitlist, track_waitlist, not_this_season
//   newDemoId()                       fresh session id (store it in the venn_demo cookie)
//   createDemoSession(id, outcome, {minor})  seed and store a session; getDemoSession(id); deleteDemoSession(id)
//   seedDemo(outcome, {minor}, id?)   the pure seed (no storing); cohort fixtures carry seat_cap 20
//   demoClientFor(id)                 a SupabaseClient lookalike (auth.*, rpc, from) or null when the id has no session
// The store lives on globalThis, keyed by session id, so sessions are isolated and state persists across requests.
// Unknown rpc names return { error: { message: 'demo: unknown rpc NAME' } }.
export { OUTCOMES, newDemoId, seedDemo, createDemoSession, getDemoSession, deleteDemoSession, demoClientFor, fakeClient } from './fake.ts';
export type { DemoOutcome, DemoState } from './fake.ts';
