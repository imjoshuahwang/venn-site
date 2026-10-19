// Port of confirm.deadline() in the venn repo's venn/confirm.py: same output for the same instant,
// "Tuesday, Oct 20, 3:40 PM PT" in America/Los_Angeles. Empty or unparseable -> NO_DEADLINE.
export const NO_DEADLINE = "24 hours from when you applied"; // legacy rows have no share_due

export function formatDeadline(shareDue: string | null | undefined): string {
  if (!shareDue) return NO_DEADLINE;
  const raw = String(shareDue).trim();
  // Postgres sends "+00"; Date wants "+00:00". A value with no offset is UTC, as in Python.
  let iso = raw.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(iso)) iso += "Z";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return NO_DEADLINE;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles", weekday: "long", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true,
    }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  return `${p.weekday}, ${p.month} ${p.day}, ${p.hour}:${p.minute} ${p.dayPeriod.toUpperCase()} PT`;
}
