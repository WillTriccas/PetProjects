import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { avatarUrl, initials, formatDate } from "@/lib/utils";
import { computeStreak, computeAchievements } from "@/lib/domain/achievements";
import { Badge } from "@/components/ui/Badge";

export default async function MemberProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerClient();

  const { data: member } = await supabase.from("profiles").select("*").eq("id", id).single();
  if (!member) notFound();

  const { data: attendanceRows } = await supabase
    .from("attendance")
    .select("event_id, status, events!inner(event_date)")
    .eq("member_id", id)
    .eq("status", "going");

  const { data: reviews } = await supabase.from("reviews").select("id").eq("member_id", id);

  const attendedDates = (attendanceRows ?? [])
    .map((row) => {
      const events = row.events as unknown as { event_date: string | null } | { event_date: string | null }[];
      const single = Array.isArray(events) ? events[0] : events;
      return single?.event_date ? new Date(single.event_date) : null;
    })
    .filter((d): d is Date => d !== null);

  const streak = computeStreak(attendedDates);
  const achievements = computeAchievements(
    { displayName: member.display_name },
    attendedDates.length,
    reviews?.length ?? 0,
    streak
  );
  const photo = avatarUrl(member.avatar_path);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full font-serif text-xl font-semibold text-white"
          style={{ backgroundColor: member.accent_color ?? "#722F37" }}
          aria-hidden="true"
        >
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element -- Supabase public object URL
            <img src={photo} alt="" className="h-full w-full rounded-full object-cover" />
          ) : (
            initials(member.display_name)
          )}
        </div>
        <div>
          <h1 className="font-serif text-2xl font-bold text-burgundy-dark">{member.display_name}</h1>
          <p className="text-sm text-burgundy-dark/60">Member since {formatDate(member.joined_at)}</p>
        </div>
      </div>

      {member.bio && <p className="text-burgundy-dark/80">{member.bio}</p>}

      {member.favorite_genres && member.favorite_genres.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {member.favorite_genres.map((genre) => (
            <Badge key={genre} variant="gold">
              {genre}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex gap-6 text-sm text-burgundy-dark/80">
        <div>
          <p className="text-2xl font-bold text-burgundy-dark">{attendedDates.length}</p>
          <p>Events attended</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-burgundy-dark">{reviews?.length ?? 0}</p>
          <p>Reviews written</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-burgundy-dark">{streak}</p>
          <p>Current streak</p>
        </div>
      </div>

      <section>
        <h2 className="mb-2 font-serif text-lg font-semibold text-burgundy-dark">Achievements</h2>
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
          <p className="text-sm text-burgundy-dark/60">No achievements yet — attend an event to get started!</p>
        )}
      </section>
    </div>
  );
}
