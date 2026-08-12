"use client";

import { Button } from "@/components/ui/Button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-gold/30 bg-white p-8 text-center">
      <h2 className="font-serif text-lg font-semibold text-burgundy-dark">Something went wrong</h2>
      <p className="max-w-sm text-sm text-burgundy-dark/70">
        {error.message || "We couldn't load this page. Please try again."}
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
