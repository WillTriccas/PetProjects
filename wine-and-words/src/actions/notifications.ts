"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";

export interface ActionResult {
  success: boolean;
  error?: string;
}

/** Mark a single notification as read (only the recipient can do this, enforced by RLS). */
export async function markRead(notificationId: string): Promise<ActionResult> {
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", notificationId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard");

  return { success: true };
}

/** Mark all of the current member's notifications as read. */
export async function markAllRead(): Promise<ActionResult> {
  const supabase = await createServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) return { success: false, error: "Not authenticated." };

  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("recipient_id", user.id)
    .eq("read", false);

  if (error) return { success: false, error: error.message };

  revalidatePath("/dashboard");

  return { success: true };
}
