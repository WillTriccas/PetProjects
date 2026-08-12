"use client";

import { useTransition } from "react";
import { recordAttendance } from "@/actions/events";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const OPTIONS: { value: "going" | "maybe" | "not_going"; label: string }[] = [
  { value: "going", label: "Going" },
  { value: "maybe", label: "Maybe" },
  { value: "not_going", label: "Can't make it" },
];

export function AttendanceButtons({ eventId, currentStatus }: { eventId: string; currentStatus: string | null }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div role="group" aria-label="Your attendance" className="flex flex-wrap gap-2">
      {OPTIONS.map((opt) => (
        <Button
          key={opt.value}
          size="sm"
          variant={currentStatus === opt.value ? "primary" : "secondary"}
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await recordAttendance(eventId, opt.value);
            })
          }
          className={cn(currentStatus === opt.value && "ring-2 ring-burgundy ring-offset-1")}
          aria-pressed={currentStatus === opt.value}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
