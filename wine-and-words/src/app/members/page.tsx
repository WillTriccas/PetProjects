import { createServerClient } from "@/lib/supabase/server";
import { MemberCard } from "@/components/MemberCard";
import { EmptyState } from "@/components/ui/Feedback";

export default async function MembersPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("club_id")
    .eq("id", user!.id)
    .single();

  const { data: members } = await supabase
    .from("profiles")
    .select("*")
    .eq("club_id", profile!.club_id)
    .order("display_name");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-serif text-2xl font-bold text-burgundy-dark">Members</h1>
      {members && members.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((member) => (
            <MemberCard key={member.id} member={member} />
          ))}
        </div>
      ) : (
        <EmptyState title="No members yet" />
      )}
    </div>
  );
}
