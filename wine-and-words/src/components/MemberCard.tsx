import Link from "next/link";
import { avatarUrl, initials } from "@/lib/utils";
import type { Profile } from "@/lib/supabase/types";

export function MemberCard({ member }: { member: Profile }) {
  const photo = avatarUrl(member.avatar_path);

  return (
    <Link
      href={`/members/${member.id}`}
      className="flex items-center gap-3 rounded-xl border border-gold/30 bg-white p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy"
    >
      <div
        className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full font-serif text-lg font-semibold text-white"
        style={{ backgroundColor: member.accent_color ?? "#722F37" }}
        aria-hidden="true"
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- Supabase public object URL
          <img src={photo} alt="" className="h-full w-full rounded-full object-cover" />
        ) : (
          initials(member.display_name)
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate font-serif font-semibold text-burgundy-dark">{member.display_name}</p>
        {member.favorite_genres && member.favorite_genres.length > 0 && (
          <p className="truncate text-xs text-burgundy-dark/60">
            {member.favorite_genres.slice(0, 3).join(" · ")}
          </p>
        )}
      </div>
    </Link>
  );
}
