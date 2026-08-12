"use client";

import { useState, useTransition } from "react";
import { sendMagicLink } from "@/actions/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gold/30 bg-white p-8 shadow-sm">
        <h1 className="text-center font-serif text-2xl font-bold text-burgundy-dark">Wine &amp; Words</h1>
        <p className="mt-2 text-center text-sm text-burgundy-dark/70">
          Sign in with a magic link — no password required.
        </p>

        {status === "sent" ? (
          <p role="status" className="mt-6 rounded-lg bg-gold/10 p-3 text-center text-sm text-burgundy-dark">
            Check your email for a sign-in link.
          </p>
        ) : (
          <form
            className="mt-6 flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const result = await sendMagicLink(email);
                if (result.success) {
                  setStatus("sent");
                } else {
                  setStatus("error");
                  setError(result.error ?? "Something went wrong.");
                }
              });
            }}
          >
            <Input
              type="email"
              name="email"
              label="Email address"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={status === "error" ? error ?? undefined : undefined}
            />
            <Button type="submit" disabled={isPending} className="w-full">
              {isPending ? "Sending…" : "Send magic link"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
