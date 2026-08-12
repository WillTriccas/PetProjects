import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { NotificationBell } from "@/components/NotificationBell";
import { signOutForm } from "@/actions/auth";
import { Button } from "@/components/ui/Button";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/events", label: "Events" },
  { href: "/books", label: "Books" },
  { href: "/members", label: "Members" },
  { href: "/achievements", label: "Nostalgia" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/auth/join");
  }

  return (
    <div className="min-h-screen">
      <header className="bg-burgundy text-cream">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="font-serif text-lg font-bold">
            🍷 Wine &amp; Words
          </Link>
          <nav className="hidden gap-4 text-sm sm:flex" aria-label="Primary">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded">
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <NotificationBell recipientId={profile.id} />
            <Link href="/profile" className="text-sm hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold rounded">
              {profile.display_name}
            </Link>
            <form action={signOutForm}>
              <Button type="submit" variant="ghost" size="sm" className="text-cream hover:bg-cream/10">
                Sign out
              </Button>
            </form>
          </div>
        </div>
        <nav className="flex gap-4 overflow-x-auto px-4 pb-2 text-sm sm:hidden" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="whitespace-nowrap hover:text-gold">
              {link.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
