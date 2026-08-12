import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { fetchAndPersistWeather } from "@/actions/weather";
import { WeatherBadge } from "@/components/WeatherBadge";
import { StarRating } from "@/components/StarRating";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDateTime } from "@/lib/utils";
import { aggregate } from "@/lib/domain/ratings";
import type { EventStatus } from "@/lib/supabase/types";
import { AttendanceButtons } from "./AttendanceButtons";
import { ReviewForm } from "./ReviewForm";
import { QuestionSection } from "./QuestionSection";

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

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: event } = await supabase.from("events").select("*").eq("id", id).single();
  if (!event) notFound();

  const [
    { data: book },
    { data: attendance },
    { data: reviews },
    { data: questions },
    { data: members },
    { data: weatherRows },
  ] = await Promise.all([
    event.book_id
      ? supabase.from("books").select("*").eq("id", event.book_id).single()
      : Promise.resolve({ data: null }),
    supabase.from("attendance").select("*").eq("event_id", id),
    supabase.from("reviews").select("*").eq("event_id", id),
    supabase.from("event_questions").select("*").eq("event_id", id).order("created_at"),
    supabase.from("profiles").select("*").eq("club_id", event.club_id),
    supabase.from("weather_snapshots").select("*").eq("event_id", id).order("fetched_at", { ascending: false }).limit(1),
  ]);

  let weather = weatherRows?.[0] ?? null;
  // Only fetch weather if the event has coordinates AND a date.
  if (!weather && event.lat != null && event.lon != null && event.event_date != null) {
    await fetchAndPersistWeather(id);
    const { data: refreshed } = await supabase
      .from("weather_snapshots")
      .select("*")
      .eq("event_id", id)
      .order("fetched_at", { ascending: false })
      .limit(1);
    weather = refreshed?.[0] ?? null;
  }

  const membersById = Object.fromEntries((members ?? []).map((m) => [m.id, m]));
  const myAttendance = (attendance ?? []).find((a) => a.member_id === user!.id);
  const myReview = (reviews ?? []).find((r) => r.member_id === user!.id);
  const ratingSummary = aggregate((reviews ?? []).map((r) => r.rating));

  const going = (attendance ?? []).filter((a) => a.status === "going");
  const status: EventStatus = event.status ?? "upcoming";

  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl font-bold text-burgundy-dark">{event.title}</h1>
            <div className="mt-1 flex items-center gap-2">
              <p className="text-burgundy-dark/70">{formatDateTime(event.event_date)}</p>
              <Badge variant={STATUS_VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>
            </div>
          </div>
          {/* Any club member can edit — RLS enforces club scope */}
          <Link href={`/events/${id}/edit`}>
            <Button variant="secondary" size="sm">Edit</Button>
          </Link>
        </div>
        {event.description && <p className="mt-3 text-burgundy-dark/80">{event.description}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-burgundy-dark/70">
          {event.venue_name && <span>{"\uD83D\uDCCD"} {event.venue_name}{event.locality ? `, ${event.locality}` : ""}</span>}
          <WeatherBadge snapshot={weather} />
        </div>
        {book && (
          <p className="mt-2 text-sm text-burgundy-dark/70">
            {"\uD83D\uDCD6"} Reading: <span className="font-medium">{book.title}</span>
            {book.author ? ` by ${book.author}` : ""}
          </p>
        )}
        {event.food_description && (
          <p className="mt-1 text-sm text-burgundy-dark/70">{"\uD83C\uDF7D\uFE0F"} {event.food_description}</p>
        )}
      </div>

      <section>
        <h2 className="mb-2 font-serif text-lg font-semibold text-burgundy-dark">Are you going?</h2>
        <AttendanceButtons eventId={id} currentStatus={myAttendance?.status ?? null} />
        <p className="mt-2 text-sm text-burgundy-dark/60">{going.length} member(s) going</p>
      </section>

      <section>
        <h2 className="mb-2 font-serif text-lg font-semibold text-burgundy-dark">Reviews</h2>
        {ratingSummary.count > 0 ? (
          <div className="mb-4 flex items-center gap-2">
            <StarRating value={ratingSummary.average} label="Average rating" />
            <span className="text-sm text-burgundy-dark/60">
              ({ratingSummary.count} review{ratingSummary.count === 1 ? "" : "s"})
            </span>
          </div>
        ) : (
          <p className="mb-4 text-sm text-burgundy-dark/60">No reviews yet.</p>
        )}

        <div className="mb-4 flex flex-col gap-3">
          {(reviews ?? []).map((review) => (
            <div key={review.id} className="rounded-lg border border-gold/20 bg-white p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-burgundy-dark">
                  {membersById[review.member_id]?.display_name ?? "Member"}
                </span>
                <StarRating value={review.rating} label="Rating" size="sm" />
              </div>
              {review.spoiler_flag ? (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-burgundy-dark/60">
                    <Badge variant="danger">Spoiler</Badge> Click to reveal
                  </summary>
                  <p className="mt-1 text-sm text-burgundy-dark/80">{review.body}</p>
                </details>
              ) : (
                review.body && <p className="mt-1 text-sm text-burgundy-dark/80">{review.body}</p>
              )}
            </div>
          ))}
        </div>

        <h3 className="mb-2 text-sm font-semibold text-burgundy-dark">Your review</h3>
        <ReviewForm
          eventId={id}
          initialRating={myReview?.rating ?? 0}
          initialBody={myReview?.body ?? ""}
          initialSpoiler={myReview?.spoiler_flag ?? false}
        />
      </section>

      <section>
        <h2 className="mb-2 font-serif text-lg font-semibold text-burgundy-dark">Questions &amp; discussion</h2>
        <QuestionSection eventId={id} questions={questions ?? []} membersById={membersById} />
      </section>
    </div>
  );
}