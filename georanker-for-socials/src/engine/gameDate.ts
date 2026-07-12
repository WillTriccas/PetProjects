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

/**
 * Return a local wall-clock timestamp (YYYY-MM-DD HH:MM:SS) in the given IANA
 * timezone. Used to stamp submissions with their real chat time for analytics.
 */
export function localTimestampFor(timezone: string, when: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(when);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  let hour = get("hour");
  if (hour === "24") hour = "00"; // some engines emit 24 for midnight
  return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get("minute")}:${get("second")}`;
}
