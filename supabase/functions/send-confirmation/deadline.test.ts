import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDeadline, NO_DEADLINE } from "./deadline.ts";

// Same cases as tests/test_confirm.py::test_deadline_formatting in the venn repo.
test("PDT", () => assert.equal(formatDeadline("2026-10-20T22:40:00+00:00"), "Tuesday, Oct 20, 3:40 PM PT"));
test("postgres +00 with micros", () => assert.equal(formatDeadline("2026-10-20T22:40:00.123456+00"), "Tuesday, Oct 20, 3:40 PM PT"));
test("PST noon", () => assert.equal(formatDeadline("2026-12-01T20:05:00Z"), "Tuesday, Dec 1, 12:05 PM PT"));
test("midnight", () => assert.equal(formatDeadline("2026-11-02T08:00:00Z"), "Monday, Nov 2, 12:00 AM PT"));
test("null and garbage fall back", () => {
  for (const v of [null, undefined, "", "garbage"]) assert.equal(formatDeadline(v), NO_DEADLINE);
});
