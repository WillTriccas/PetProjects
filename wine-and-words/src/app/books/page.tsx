import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { BookCard } from "@/components/BookCard";
import { EmptyState } from "@/components/ui/Feedback";
import { Button } from "@/components/ui/Button";

export default async function BooksPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("club_id")
    .eq("id", user!.id)
    .single();

  const { data: books } = await supabase
    .from("books")
    .select("*")
    .eq("club_id", profile!.club_id)
    .order("added_at", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-bold text-burgundy-dark">Book library</h1>
        <Link href="/books/search">
          <Button size="sm">Add a book</Button>
        </Link>
      </div>

      {books && books.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No books yet"
          description="Search Open Library to add your first pick."
          action={
            <Link href="/books/search">
              <Button size="sm">Search books</Button>
            </Link>
          }
        />
      )}
    </div>
  );
}
