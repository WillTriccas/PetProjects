/**
 * Return the current game date as YYYY-MM-DD in the given IANA timezone.
 * Used to stamp a round when it opens.
 */
export function gameDateFor(timezone: string, when: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA yields YYYY-MM-DD.
  return fmt.format(when);
}
