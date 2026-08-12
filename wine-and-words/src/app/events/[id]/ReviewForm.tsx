"use client";

import { useState, useTransition } from "react";
import { upsertReview } from "@/actions/reviews";
import { StarRating } from "@/components/StarRating";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";

export function ReviewForm({
  eventId,
  initialRating,
  initialBody,
  initialSpoiler,
}: {
  eventId: string;
  initialRating: number;
  initialBody: string;
  initialSpoiler: boolean;
}) {
  const [rating, setRating] = useState(initialRating || 3);
  const [body, setBody] = useState(initialBody);
  const [spoiler, setSpoiler] = useState(initialSpoiler);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setSaved(false);
        startTransition(async () => {
          const result = await upsertReview({ eventId, rating, body, spoilerFlag: spoiler });
          if (result.success) {
            setSaved(true);
          } else {
            setError(result.error ?? "Something went wrong.");
          }
        });
      }}
    >
      <StarRating value={rating} onChange={setRating} label="Your rating" />
      <Textarea
        label="Your review"
        placeholder="What did you think?"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <label className="flex items-center gap-2 text-sm text-burgundy-dark">
        <input
          type="checkbox"
          checked={spoiler}
          onChange={(e) => setSpoiler(e.target.checked)}
          className="h-4 w-4 rounded border-gold/50 text-burgundy focus:ring-burgundy"
        />
        Contains spoilers
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && !isPending && <p className="text-sm text-green-700">Review saved.</p>}
      <Button type="submit" size="sm" disabled={isPending} className="self-start">
        {isPending ? "Saving…" : "Save review"}
      </Button>
    </form>
  );
}
