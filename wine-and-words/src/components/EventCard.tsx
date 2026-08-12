import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { WeatherBadge } from "@/components/WeatherBadge";
import { formatDateTime } from "@/lib/utils";
import type { Event, EventStatus, WeatherSnapshot } from "@/lib/supabase/types";

const STATUS_LABELS: Record<EventStatus, string> = {
  upcoming: "Upcoming",
  completed: "Completed",
  cancelled: "Cancelled",
  unscheduled: "Date TBD",
};

const STATUS_VARIANTS: Record<EventStatus, "burgundy" | "neutral" | "danger" | "gold"> = {
  upcoming: "burgundy",
  completed: "neutral",
  cancelled: "danger",
  unscheduled: "gold",
};

export function EventCard({
  event,
  bookTitle,
  weather,
}: {
  event: Event;
  bookTitle?: string | null;
  weather?: WeatherSnapshot | null;
}) {
  const status: EventStatus =
    event.status ??
    (event.event_date && new Date(event.event_date) < new Date() ? "completed" : "upcoming");

  return (
    <Link
      href={`/events/${event.id}`}
      className="block rounded-xl border border-gold/30 bg-white p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-serif text-lg font-semibold text-burgundy-dark">{event.title}</h3>
        <Badge variant={STATUS_VARIANTS[status] ?? "neutral"}>
          {STATUS_LABELS[status] ?? status}
        </Badge>
      </div>
      <p className="mt-1 text-sm text-burgundy-dark/70">{formatDateTime(event.event_date)}</p>
      {event.venue_name && (
        <p className="mt-1 text-sm text-burgundy-dark/70">
          {"\uD83D\uDCCD"} {event.venue_name}
          {event.locality ? `, ${event.locality}` : ""}
        </p>
      )}
      {bookTitle && <p className="mt-1 text-sm text-burgundy-dark/70">{"\uD83D\uDCD6"} {bookTitle}</p>}
      <div className="mt-3">
        <WeatherBadge snapshot={weather ?? null} />
      </div>
    </Link>
  );
}