/** Small shared utility helpers used across components and pages. */

/** Merge class name fragments, filtering out falsy values. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/** Format an ISO date string / Date for display, e.g. "Jun 15, 2024". Returns "Date TBD" for null. */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "Date TBD";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** Format an ISO date string / Date with time, e.g. "Jun 15, 2024, 7:00 PM". Returns "Date TBD" for null. */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "Date TBD";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Get initials from a display name, e.g. "Jane Doe" -> "JD". */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Resolve a stored avatar object path to its public Supabase URL. */
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) return null;

  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${baseUrl}/storage/v1/object/public/avatars/${encodedPath}`;
}

/** Convert an ISO date-time string to a YYYY-MM-DD date-only string. */
export function toDateOnly(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().slice(0, 10);
}
