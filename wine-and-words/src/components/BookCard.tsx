import Image from "next/image";
import type { Book } from "@/lib/supabase/types";

export function BookCard({ book }: { book: Book }) {
  return (
    <div className="flex gap-3 rounded-xl border border-gold/30 bg-white p-3 shadow-sm">
      <div className="relative h-24 w-16 flex-shrink-0 overflow-hidden rounded-md bg-cream-dark">
        {book.cover_url ? (
          <Image
            src={book.cover_url}
            alt={`Cover of ${book.title}`}
            fill
            sizes="64px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl" aria-hidden="true">
            📕
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-serif font-semibold text-burgundy-dark">{book.title}</h3>
        {book.author && <p className="truncate text-sm text-burgundy-dark/70">{book.author}</p>}
        <p className="mt-1 text-xs text-burgundy-dark/50">
          {[book.published_year, book.page_count ? `${book.page_count} pages` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    </div>
  );
}
