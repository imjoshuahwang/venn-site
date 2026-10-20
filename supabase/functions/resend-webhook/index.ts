// Resend delivery webhook (svix-signed): records bounces, complaints and deliveries in rs_events (venn#397 G5).
import { handle } from "./handler.ts";

Deno.serve((req) => handle(req, (k) => Deno.env.get(k)));
