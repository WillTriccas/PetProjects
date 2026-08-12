import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { EventCard } from "@/components/EventCard";
import { EmptyState } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";

export default async function EventsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("club_id")
    .eq("id", user!.id)
    .single();

  const { data: events } = await supabase
    .from("events")
    .select("*")
    .eq("club_id", profile!.club_id)
    .order("event_date", { ascending: false, nullsFirst: false });

  const bookIds = (events ?? []).map((e) => e.book_id).filter((id): id is string => !!id);
  const { data: books } =
    bookIds.length > 0
      ? await supabase.from("books").select("id, title").in("id", bookIds)
      : { data: [] };
  const bookTitleById = new Map((books ?? []).map((b) => [b.id, b.title]));

  const upcoming = (events ?? []).filter(
    (e) => e.status === "upcoming" || e.status === "unscheduled"
  );
  const past = (events ?? []).filter((e) => e.status === "completed");
  const cancelled = (events ?? []).filter((e) => e.status === "cancelled");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-bold text-burgundy-dark">Events</h1>
        <Link href="/events/new">
          <Button size="sm">New event</Button>
        </Link>
      </div>

      <section>
        <h2 className="mb-3 font-serif text-lg font-semibold text-burgundy-dark">Upcoming</h2>
        {upcoming.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((event) => (
              <EventCard key={event.id} event={event} bookTitle={event.book_id ? bookTitleById.get(event.book_id) : null} />
            ))}
          </div>
        ) : (
          <EmptyState title="No upcoming events" description="Create one to get the club together." />
        )}
      </section>

      <section>
        <h2 className="mb-3 font-serif text-lg font-semibold text-burgundy-dark">History</h2>
        {past.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {past.map((event) => (
              <EventCard key={event.id} event={event} bookTitle={event.book_id ? bookTitleById.get(event.book_id) : null} />
            ))}
          </div>
        ) : (
          <EmptyState title="No past events yet" />
        )}
      </section>

      {cancelled.length > 0 && (
        <section>
          <h2 className="mb-3 font-serif text-lg font-semibold text-burgundy-dark">Cancelled</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cancelled.map((event) => (
              <EventCard key={event.id} event={event} bookTitle={event.book_id ? bookTitleById.get(event.book_id) : null} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
