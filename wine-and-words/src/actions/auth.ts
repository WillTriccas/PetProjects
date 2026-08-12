"use server";

import { createServerClient } from "@/lib/supabase/server";

export interface ActionResult {
  success: boolean;
  error?: string;
}

/** Send a Supabase magic-link email to sign the user in (or up). */
export async function sendMagicLink(email: string): Promise<ActionResult> {
  if (!email || !email.includes("@")) {
    return { success: false, error: "Please enter a valid email address." };
  }

  const supabase = await createServerClient();
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Join a club using the shared access code. Verifies the code server-side via
 * the `join_club` Postgres function (security definer), then creates the
 * caller's profile row.
 */
export async function joinClub(input: {
  clubId: string;
  accessCode: string;
  displayName: string;
}): Promise<ActionResult> {
  const { clubId, accessCode, displayName } = input;

  if (!clubId || !accessCode || !displayName.trim()) {
    return { success: false, error: "All fields are required." };
  }

  const supabase = await createServerClient();

  const { error } = await supabase.rpc("join_club", {
    p_access_code: accessCode,
    p_display_name: displayName.trim(),
    p_club_id: clubId,
  });

  if (error) {
    if (error.message.includes("invalid_access_code")) {
      return { success: false, error: "That access code isn't valid." };
    }
    return { success: false, error: error.message };
  }

  return { success: true };
}

/** Sign the current user out. */
export async function signOut(): Promise<ActionResult> {
  const supabase = await createServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/** Form-action-friendly wrapper for signOut (form actions must return void). */
export async function signOutForm(): Promise<void> {
  await signOut();
}
