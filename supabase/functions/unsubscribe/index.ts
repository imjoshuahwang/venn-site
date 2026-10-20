// One-click unsubscribe (RFC 8058). See handler.ts for the link and token format.
import { handle } from "./handler.ts";

Deno.serve((req) => handle(req, (k) => Deno.env.get(k)));
