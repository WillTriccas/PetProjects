import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { EditEventForm } from "./EditEventForm";

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerClient();

  const { data: event } = await supabase.from("events").select("*").eq("id", id).single();
  if (!event) notFound();

  const { data: books } = await supabase
    .from("books")
    .select("id, title")
    .eq("club_id", event.club_id)
    .order("title");

  return (
    <div>
      <h1 className="mb-6 font-serif text-2xl font-bold text-burgundy-dark">Edit event</h1>
      <EditEventForm event={event} books={books ?? []} />
    </div>
  );
}
