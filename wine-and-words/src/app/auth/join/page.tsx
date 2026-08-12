"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { joinClub } from "@/actions/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface PublicClub {
  id: string;
  name: string;
}

export default function JoinPage() {
  const router = useRouter();
  const [clubs, setClubs] = useState<PublicClub[]>([]);
  const [clubId, setClubId] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc("list_public_clubs").then(({ data }) => {
      setClubs(data ?? []);
      if (data && data.length === 1) setClubId(data[0]!.id);
    });
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gold/30 bg-white p-8 shadow-sm">
        <h1 className="text-center font-serif text-2xl font-bold text-burgundy-dark">Join your club</h1>
        <p className="mt-2 text-center text-sm text-burgundy-dark/70">
          Enter the shared access code your club organizer gave you.
        </p>

        <form
          className="mt-6 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await joinClub({ clubId, accessCode, displayName });
              if (result.success) {
                router.push("/dashboard");
                router.refresh();
              } else {
                setError(result.error ?? "Something went wrong.");
              }
            });
          }}
        >
          {clubs.length > 1 && (
            <div className="flex flex-col gap-1">
              <label htmlFor="club" className="text-sm font-medium text-burgundy-dark">
                Club
              </label>
              <select
                id="club"
                required
                value={clubId}
                onChange={(e) => setClubId(e.target.value)}
                className="rounded-lg border border-gold/40 bg-white px-3 py-2 text-sm text-burgundy-dark focus:outline-none focus:ring-2 focus:ring-burgundy"
              >
                <option value="" disabled>
                  Select a club…
                </option>
                {clubs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Input
            name="displayName"
            label="Display name"
            placeholder="Jane Doe"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <Input
            name="accessCode"
            label="Access code"
            placeholder="Shared code"
            required
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            error={error ?? undefined}
          />
          <Button type="submit" disabled={isPending || !clubId} className="w-full">
            {isPending ? "Joining…" : "Join club"}
          </Button>
        </form>
      </div>
    </main>
  );
}
