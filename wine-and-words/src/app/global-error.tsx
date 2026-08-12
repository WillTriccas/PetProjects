"use client";

import { Button } from "@/components/ui/Button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-cream px-4">
        <div className="max-w-md rounded-2xl border border-gold/30 bg-white p-8 text-center shadow-sm">
          <h1 className="font-serif text-xl font-bold text-burgundy-dark">Something went wrong</h1>
          <p className="mt-2 text-sm text-burgundy-dark/70">
            {error.message || "An unexpected error occurred. Please try again."}
          </p>
          <Button onClick={reset} className="mt-4">
            Try again
          </Button>
        </div>
      </body>
    </html>
  );
}
