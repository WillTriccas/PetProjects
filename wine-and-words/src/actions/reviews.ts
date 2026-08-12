"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { roundToHalf } from "@/lib/domain/ratings";

export interface ActionResult {
  success: boolean;
  error?: string;
}

export interface UpsertReviewInput {
  eventId: string;
  rating: number;
  body?: string;
  spoilerFlag?: boolean;
}

/** Create or update the current member's review for an event (one per member per event). */
export async function upsertReview(input: UpsertReviewInput): Promise<ActionResult> {
  const rating = roundToHalf(input.rating);
  if (!input.eventId) {
    return { success: false, error: "Missing event." };
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

  const { error } = await supabase.from("reviews").upsert(
    {
      event_id: input.eventId,
      club_id: profile.club_id,
      member_id: user.id,
      rating,
      body: input.body ?? null,
      spoiler_flag: input.spoilerFlag ?? false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_id,member_id" }
  );

  if (error) return { success: false, error: error.message };

  revalidatePath(`/events/${input.eventId}`);

  return { success: true };
}
