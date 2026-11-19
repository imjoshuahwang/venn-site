import type { APIRoute } from 'astro';
import { handleCallback } from '../../../lib/portal/callback';

export const prerender = false;

// Invite and recovery links land here. A live link signs in once and goes on to `next`; a reused or expired one lands on the resend page.
export const GET: APIRoute = async ({ url, locals, redirect }) => redirect(await handleCallback(url, locals.supabase), 303);
