// Interaction flows run after the universal checks. Returns result rows: [{ check, pass, details }].
// Later sub-issues fill this in; flows must never POST to Supabase.
export async function runFlows(page, device) {
  return [];
}
