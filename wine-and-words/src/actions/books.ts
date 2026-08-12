"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { mapToBook, searchBooks, type OpenLibraryResult } from "@/lib/domain/openLibrary";

export interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

/** Server-side proxy for Open Library search (kept off the client per API usage rules). */
export async function searchBooksAction(query: string): Promise<OpenLibraryResult[]> {
  return searchBooks(query);
}

/** Import an Open Library search result into the club's book library. */
export async function importBook(
  result: OpenLibraryResult
): Promise<ActionResult<{ id: string }>> {
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

  const mapped = mapToBook(result);

  const { data, error } = await supabase
    .from("books")
    .insert({ ...mapped, club_id: profile.club_id, added_by: user.id })
    .select("id")
    .single();

  if (error) return { success: false, error: error.message };

  revalidatePath("/books");

  return { success: true, data: { id: data.id } };
}
