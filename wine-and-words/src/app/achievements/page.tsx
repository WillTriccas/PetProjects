import { createServerClient } from "@/lib/supabase/server";
import { computeStreak, findAnniversaries, popularMonth, computeAchievements } from "@/lib/domain/achievements";
import { Badge } from "@/components/ui/Badge";

export default async function AchievementsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user!.id).single();

  const { data: attendanceRows } = await supabase
    .from("attendance")
    .select("event_id, events!inner(event_date)")
    .eq("member_id", user!.id)
    .eq("status", "going");

  const { data: reviews } = await supabase.from("reviews").select("id").eq("member_id", user!.id);

  const { data: clubEvents } = await supabase
    .from("events")
    .select("event_date")
    .eq("club_id", profile!.club_id);

  const attendedDates = (attendanceRows ?? [])
    .map((row) => {
      const events = row.events as unknown as { event_date: string | null } | { event_date: string | null }[];
      const single = Array.isArray(events) ? events[0] : events;
      return single?.event_date ? new Date(single.event_date) : null;
    })
    .filter((d): d is Date => d !== null);

  const streak = computeStreak(attendedDates);
  const achievements = computeAchievements(
    { displayName: profile!.display_name },
    attendedDates.length,
    reviews?.length ?? 0,
    streak
  );
  const anniversaries = findAnniversaries(new Date(profile!.joined_at), new Date());
  const popular = popularMonth((clubEvents ?? []).filter((e) => e.event_date != null).map((e) => new Date(e.event_date!)));

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-serif text-2xl font-bold text-burgundy-dark">Nostalgia &amp; achievements</h1>

      {anniversaries.length > 0 && (
        <section className="rounded-xl border border-gold/40 bg-gold/10 p-4">
          <h2 className="font-serif text-lg font-semibold text-burgundy-dark">🎉 Anniversary!</h2>
          {anniversaries.map((a) => (
            <p key={a.years} className="text-burgundy-dark/80">
              {a.label}
            </p>
          ))}
        </section>
      )}

      <section>
        <h2 className="mb-3 font-serif text-lg font-semibold text-burgundy-dark">Your achievements</h2>
        {achievements.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {achievements.map((a) => (
              <li key={a.id} className="rounded-lg border border-gold/30 bg-white p-3">
                <p className="font-semibold text-burgundy-dark">{a.label}</p>
                <p className="text-sm text-burgundy-dark/70">{a.description}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-burgundy-dark/60">Attend an event or leave a review to start earning achievements.</p>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-serif text-lg font-semibold text-burgundy-dark">Club stats</h2>
        <div className="flex items-center gap-2">
          <span className="text-burgundy-dark/80">Most popular meeting month:</span>
          {popular ? (
            <Badge variant="burgundy">
              {popular.month} ({popular.count})
            </Badge>
          ) : (
            <span className="text-sm text-burgundy-dark/50">Not enough data yet</span>
          )}
        </div>
      </section>
    </div>
  );
}
