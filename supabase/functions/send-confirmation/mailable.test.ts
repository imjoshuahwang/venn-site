import { test } from "node:test";
import assert from "node:assert/strict";
import { mailable } from "./mailable.ts";

const notFound = () => Object.assign(new Error("nf"), { name: "NotFound" });
const mx = (...ex: string[]) => ex.map((exchange) => ({ preference: 10, exchange }));

test("MX present -> true", async () => {
  assert.equal(await mailable("a.com", async () => mx("mail.a.com.")), true);
});
test("null MX -> false", async () => {
  assert.equal(await mailable("a.com", async () => mx(".")), false);
});
test("MX and A NotFound -> false", async () => {
  const r = async () => { throw notFound(); };
  assert.equal(await mailable("a.com", r), false);
});
test("MX NotFound, A present -> true", async () => {
  const r = async (_d: string, t: string) => { if (t === "MX") throw notFound(); return ["1.2.3.4"]; };
  assert.equal(await mailable("a.com", r), true);
});
test("other error -> true", async () => {
  const r = async () => { throw new Error("SERVFAIL"); };
  assert.equal(await mailable("a.com", r), true);
});
test("hung resolver fails open within the budget", async () => {
  const t0 = Date.now();
  const ok = await mailable("a.com", () => new Promise<never>(() => {}), 50);
  assert.equal(ok, true);
  assert.ok(Date.now() - t0 < 200);
});
test("MX NotFound then hung A shares one deadline", async () => {
  const r = (_d: string, t: string) => t === "MX"
    ? new Promise<never>((_, rej) => setTimeout(() => rej(notFound()), 30))
    : new Promise<never>(() => {});
  const t0 = Date.now();
  assert.equal(await mailable("a.com", r, 50), true);
  assert.ok(Date.now() - t0 < 90);
});
test("no resolver -> true", async () => {
  assert.equal(await mailable("a.com", undefined), true);
});
