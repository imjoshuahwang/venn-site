// Stress-mode registry, keyed by CLI flag name (e.g. --slow-3g). Empty on purpose: later sub-issues add entries.
// Each mode = { contextOptions: {...merged into the Playwright context}, beforePage: async (page) => {...} }.
export const modes = {};
