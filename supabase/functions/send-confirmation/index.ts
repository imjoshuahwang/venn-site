// Instant "we got your application" email. Fired by a Postgres trigger (see migration 20261018030000).
// template.json is generated, not hand-edited: regenerate it with `python -m venn confirm --emit-template <path>`
// in the venn repo (confirm.py is the single source of truth), then copy it here.
import { handle } from "./handler.ts";

Deno.serve((req) => handle(req, (k) => Deno.env.get(k)));
