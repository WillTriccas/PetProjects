"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import type { Database, EventStatus } from "@/lib/supabase/types";

export interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

type EventInsert = Database["public"]["Tables"]["events"]["Insert"];
type EventUpdate = Database["public"]["Tables"]["events"]["Update"];

export interface CreateEventInput {
  title: string;
  description?: string;
  status?: EventStatus;
  eventDate?: string | null;
  venueName?: string;
  locality?: string;
  lat?: number;
  lon?: number;
  foodDescription?: string;
  bookId?: string;
  hostId?: string;
}

/** Create a new event within the caller's club. */
export async function createEvent(input: CreateEventInput): Promise<ActionResult<{ id: string }>> {
  if (!input.title.trim()) {
    return { success: false, error: "Title is required." };
  }

  const status: EventStatus = input.status ?? "upcoming";
  // Unscheduled events have no date; all other statuses require one.
  if (status !== "unscheduled" && !input.eventDate) {
    return { success: false, error: "A date is required for scheduled events." };
  }

  const supabase = await createServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) return { success: false, error: "Not authenticated." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("club_id")
    .eq("id", user.id)
    .single();

  if (!profile) return { success: false, error: "Profile not found." };

  const insert: EventInsert = {
    club_id: profile.club_id,
    title: input.title.trim(),
    description: input.description ?? null,
    status,
    event_date: status === "unscheduled" ? null : (input.eventDate ?? null),
    venue_name: input.venueName ?? null,
    locality: input.locality ?? null,
    lat: input.lat ?? null,
    lon: input.lon ?? null,
    food_description: input.foodDescription ?? null,
    book_id: input.bookId ?? null,
    host_id: input.hostId ?? user.id,
    created_by: user.id,
  };

  const { data, error } = await supabase.from("events").insert(insert).select("id").single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/events");
  revalidatePath("/dashboard");

  return { success: true, data: { id: data.id } };
}

export interface UpdateEventInput {
  id: string;
  title?: string;
  description?: string;
  status?: EventStatus;
  eventDate?: string | null;
  venueName?: string;
  locality?: string;
  lat?: number;
  lon?: number;
  foodDescription?: string;
  bookId?: string;
  hostId?: string;
}

/** Update an existing event. Any club member may update per RLS policy. */
export async function updateEvent(input: UpdateEventInput): Promise<ActionResult> {
  const supabase = await createServerClient();

  const update: EventUpdate = {
    updated_at: new Date().toISOString(),
  };
  if (input.title !== undefined) update.title = input.title.trim();
  if (input.description !== undefined) update.description = input.description;
  if (input.status !== undefined) update.status = input.status;
  if (input.eventDate !== undefined) update.event_date = input.eventDate ?? null;
  if (input.venueName !== undefined) update.venue_name = input.venueName;
  if (input.locality !== undefined) update.locality = input.locality;
  if (input.lat !== undefined) update.lat = input.lat;
  if (input.lon !== undefined) update.lon = input.lon;
  if (input.foodDescription !== undefined) update.food_description = input.foodDescription;
  if (input.bookId !== undefined) update.book_id = input.bookId;
  if (input.hostId !== undefined) update.host_id = input.hostId;

  const { error } = await supabase.from("events").update(update).eq("id", input.id);

  if (error) return { success: false, error: error.message };

  revalidatePath(`/events/${input.id}`);
  revalidatePath("/events");

  return { success: true };
}

/** Record (or update) the current member's attendance status for an event. */
export async function recordAttendance(
  eventId: string,
  status: "going" | "maybe" | "not_going"
): Promise<ActionResult> {
  const supabase = await createServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) return { success: false, error: "Not authenticated." };

  const { error } = await supabase
    .from("attendance")
    .upsert(
      { event_id: eventId, member_id: user.id, status },
      { onConflict: "event_id,member_id" }
    );

  if (error) return { success: false, error: error.message };

  revalidatePath(`/events/${eventId}`);

  return { success: true };
}

/** Post a question (or a threaded reply, when parentId is set) on an event. */
export async function postQuestion(
  eventId: string,
  parentId: string | null,
  body: string
): Promise<ActionResult> {
  if (!body.trim()) return { success: false, error: "Question cannot be empty." };

  const supabase = await createServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) return { success: false, error: "Not authenticated." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("club_id")
    .eq("id", user.id)
    .single();

  if (!profile) return { success: false, error: "Profile not found." };

  const { error } = await supabase.from("event_questions").insert({
    event_id: eventId,
    club_id: profile.club_id,
    author_id: user.id,
    parent_id: parentId,
    body: body.trim(),
  });

  if (error) return { success: false, error: error.message };

  revalidatePath(`/events/${eventId}`);

  return { success: true };
}
