// Seeded portal test users and the pure plan builder (#118). No network, no env reads except via arguments.
// The phone harness (#122/#123) imports SEEDED_USERS, PARENT_TOKEN and TEST_PASSWORD_DEFAULT from here.
import { createHash } from 'node:crypto';

export const SEASON = 'fall-2026';
export const TEST_PASSWORD_DEFAULT = 'portal-test-local-only-1';
// Raw parent co-sign token for the minor; parent_consents.token_hash stores sha256 hex of this. Local/preview only.
export const PARENT_TOKEN = 'portal-seed-parent-token-local-only';
export const hashToken = (t) => createHash('sha256').update(t).digest('hex');
export const emailFor = (slug) => `contact+portal-${slug}@joinvenn.org`;

const LANDING = '/portal';
const DONE = '2026-11-02T00:00:00Z';
const DAY = '2026-11-01T00:00:00Z';

// slug, outcome label, extra result fields. `members` have an auth user but no applications/results row.
const RESULT_SPECS = [
  { slug: 'cohort', outcome: 'cohort', cohort: 'test-cohort' },
  { slug: 'cohort-done', outcome: 'cohort', cohort: 'test-cohort', ceremony_done_at: DONE },
  { slug: 'cohort-full', outcome: 'cohort', cohort: 'test-cohort-full' },
  { slug: 'cohort-full-b', outcome: 'cohort', cohort: 'test-cohort-full' },
  { slug: 'peer-a', outcome: 'peer' },
  { slug: 'peer-b', outcome: 'peer' },
  { slug: 'peer-one-a', outcome: 'peer' },
  { slug: 'peer-one-b', outcome: 'peer' },
  { slug: 'peer-both-a', outcome: 'peer' },
  { slug: 'peer-both-b', outcome: 'peer' },
  { slug: 'network', outcome: 'network_waitlist' },
  { slug: 'track', outcome: 'track_waitlist' },
  { slug: 'nts', outcome: 'not_this_season' },
  { slug: 'draft', outcome: 'cohort', cohort: 'test-cohort', status: 'draft' },
  { slug: 'minor', outcome: 'cohort', cohort: 'test-cohort', minor: true },
  { slug: 'lead', outcome: 'cohort', cohort: 'test-cohort' },
];
const MEMBERS = ['member-1', 'member-2'];
// Every other result user has answered the consent ceremony (src/data/consent.ts); these two still land on /portal/ceremony.
export const UNCONSENTED = ['cohort-done', 'minor'];
export const CONSENT_VERSION = '2026-11-v1';
export const CONSENT_CLAUSES = ['coordinator_groups', 'highlights', 'full_name_photo', 'data_use', 'retention'];

export const SEEDED_USERS = [
  ...RESULT_SPECS.map((s) => ({
    slug: s.slug, email: emailFor(s.slug), outcome: s.outcome, status: s.status ?? 'approved',
    landing: LANDING,
  })),
  ...MEMBERS.map((slug) => ({ slug, email: emailFor(slug), outcome: 'team_member', status: 'approved', landing: LANDING })),
];

export function buildPlan() {
  const cohorts = [
    { slug: 'test-cohort', name: 'Test Cohort', season: SEASON, seat_cap: 6, goal: 'Test goal', timeline: 'Test timeline' },
    { slug: 'test-cohort-full', name: 'Test Cohort (full)', season: SEASON, seat_cap: 1 },
  ];
  const results = RESULT_SPECS.map((s) => ({
    slug: s.slug, email: emailFor(s.slug), season: SEASON, outcome: s.outcome,
    cohort: s.cohort ?? null,
    status: s.status ?? 'approved',
    approved_at: (s.status ?? 'approved') === 'approved' ? DAY : null,
    letter: `Test letter for ${s.slug}.`,
    ceremony_done_at: s.ceremony_done_at ?? null,
    why_matched: s.minor ? 'Under 18: parent co-sign pending.' : null,
  }));
  const pairs = [
    { a: 'peer-a', b: 'peer-b', a_down: false, b_down: false },
    { a: 'peer-one-a', b: 'peer-one-b', a_down: true, b_down: false },
    { a: 'peer-both-a', b: 'peer-both-b', a_down: true, b_down: true },
  ].map((p) => ({ ...p, why_matched: 'Test peer pair.' }));
  const parent = {
    user: 'minor', parent_email: emailFor('parent-minor'),
    token_hash: hashToken(PARENT_TOKEN), signed_at: null,
  };
  const teamMembers = MEMBERS.map((m) => ({ lead: 'lead', slug: m, email: emailFor(m) }));
  return { cohorts, results, pairs, parent, teamMembers };
}

const PROD_REF = 'wirjadichvbmrqzamwtp';
// The public demo service-role key every local `supabase start` stack ships with (not a secret).
const LOCAL_DEMO_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const LOCAL_URL = 'http://127.0.0.1:54321';
const isLocal = (u) => /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(u);

// Throws before any write. Local needs a local URL; preview needs both PREVIEW_* vars and a non-local, non-prod URL.
export function resolveTarget({ target = 'local', env = {} }) {
  if (target === 'preview') {
    const url = env.PREVIEW_SUPABASE_URL, key = env.PREVIEW_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('--target preview needs PREVIEW_SUPABASE_URL and PREVIEW_SERVICE_ROLE_KEY');
    if (url.includes(PROD_REF)) throw new Error('refusing the prod project');
    if (isLocal(url)) throw new Error('preview URL must not be local');
    return { url, key, target };
  }
  if (target !== 'local') throw new Error(`unknown target ${target}`);
  const url = env.SUPABASE_URL || LOCAL_URL;
  if (!isLocal(url)) throw new Error(`refusing non-local SUPABASE_URL without --target preview: ${url}`);
  const key = env.SUPABASE_SERVICE_ROLE_KEY || LOCAL_DEMO_SERVICE_KEY;
  return { url, key, target };
}
