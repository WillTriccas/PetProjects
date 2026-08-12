"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AvatarUpload } from "@/components/AvatarUpload";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import type { Profile } from "@/lib/supabase/types";
import { avatarUrl } from "@/lib/utils";

export function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [genres, setGenres] = useState((profile.favorite_genres ?? []).join(", "));
  const [accentColor, setAccentColor] = useState(profile.accent_color ?? "#722F37");
  const [avatarPath, setAvatarPath] = useState(profile.avatar_path);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="flex max-w-xl flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSaved(false);
        startTransition(async () => {
          const supabase = createClient();
          const { error: updateError } = await supabase
            .from("profiles")
            .update({
              display_name: displayName.trim(),
              bio: bio || null,
              favorite_genres: genres
                ? genres.split(",").map((g) => g.trim()).filter(Boolean)
                : null,
              accent_color: accentColor,
              avatar_path: avatarPath,
              updated_at: new Date().toISOString(),
            })
            .eq("id", profile.id);

          if (updateError) {
            setError(updateError.message);
          } else {
            setSaved(true);
            router.refresh();
          }
        });
      }}
    >
      <AvatarUpload
        userId={profile.id}
        displayName={displayName}
        currentAvatarUrl={avatarUrl(avatarPath)}
        onUploaded={setAvatarPath}
      />
      <Input label="Display name" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      <Textarea label="Bio" value={bio} onChange={(e) => setBio(e.target.value)} />
      <Input
        label="Favorite genres (comma separated)"
        value={genres}
        onChange={(e) => setGenres(e.target.value)}
      />
      <div className="flex flex-col gap-1">
        <label htmlFor="accentColor" className="text-sm font-medium text-burgundy-dark">
          Accent color
        </label>
        <input
          id="accentColor"
          type="color"
          value={accentColor}
          onChange={(e) => setAccentColor(e.target.value)}
          className="h-10 w-20 rounded border border-gold/40"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && !isPending && <p className="text-sm text-green-700">Profile updated.</p>}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
