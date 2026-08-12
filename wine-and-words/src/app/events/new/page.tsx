import { createServerClient } from "@/lib/supabase/server";
import { EventForm } from "./EventForm";

export default async function NewEventPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("club_id")
    .eq("id", user!.id)
    .single();

  const { data: books } = await supabase
    .from("books")
    .select("id, title")
    .eq("club_id", profile!.club_id)
    .order("title");

  return (
    <div>
      <h1 className="mb-6 font-serif text-2xl font-bold text-burgundy-dark">Schedule an event</h1>
      <EventForm books={books ?? []} />
    </div>
  );
}
