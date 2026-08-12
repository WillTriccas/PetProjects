import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { EventCard } from "@/components/EventCard";
import { EmptyState } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";

export default async function DashboardPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("club_id, display_name")
    .eq("id", user!.id)
    .single();

  // Fetch upcoming events: scheduled (date >= now) OR unscheduled (date TBD).
  const { data: scheduledEvents } = await supabase
    .from("events")
    .select("*")
    .eq("club_id", profile!.club_id)
    .eq("status", "upcoming")
    .gte("event_date", new Date().toISOString())
    .order("event_date", { ascending: true })
    .limit(3);

  const { data: unscheduledEvents } = await supabase
    .from("events")
    .select("*")
    .eq("club_id", profile!.club_id)
    .eq("status", "unscheduled")
    .order("created_at", { ascending: false })
    .limit(3);

  const upcomingEvents = [...(scheduledEvents ?? []), ...(unscheduledEvents ?? [])].slice(0, 3);

  const bookIds = (upcomingEvents ?? []).map((e) => e.book_id).filter((id): id is string => !!id);
  const { data: books } =
    bookIds.length > 0
      ? await supabase.from("books").select("id, title").in("id", bookIds)
      : { data: [] };
  const bookTitleById = new Map((books ?? []).map((b) => [b.id, b.title]));

  const eventIds = (upcomingEvents ?? []).map((e) => e.id);
  const { data: weatherRows } =
    eventIds.length > 0
      ? await supabase.from("weather_snapshots").select("*").in("event_id", eventIds)
      : { data: [] };
  const weatherByEvent = new Map((weatherRows ?? []).map((w) => [w.event_id, w]));

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="font-serif text-2xl font-bold text-burgundy-dark">
          Welcome back, {profile!.display_name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-burgundy-dark/70">Here&apos;s what&apos;s coming up for your club.</p>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold text-burgundy-dark">Upcoming events</h2>
          <Link href="/events/new">
            <Button size="sm">New event</Button>
          </Link>
        </div>
        {upcomingEvents && upcomingEvents.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                bookTitle={event.book_id ? bookTitleById.get(event.book_id) : null}
                weather={weatherByEvent.get(event.id) ?? null}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No upcoming events yet"
            description="Schedule your club's next gathering to see it here."
            action={
              <Link href="/events/new">
                <Button size="sm">Schedule an event</Button>
              </Link>
            }
          />
        )}
      </section>
    </div>
  );
}
