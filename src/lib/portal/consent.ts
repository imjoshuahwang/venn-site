// Under-18 proxy (#127): applications.level is a grade band, not an age. high_school counts as a minor.
export function isMinor(application: { level?: string | null } | null | undefined): boolean {
  return application?.level === 'high_school';
}
