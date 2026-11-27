// Scheduled sweep (pg_cron or the Supabase scheduler POSTs here with x-webhook-secret): mails first requests,
// hour-48 reminders and the kind expiry notice. MATCH_SENDS_ENABLED unset means it does nothing at all (#251).
import { handle } from "./handler.ts";

Deno.serve((req) => handle(req, (k) => Deno.env.get(k)));
