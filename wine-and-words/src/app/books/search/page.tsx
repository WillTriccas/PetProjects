"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { searchBooksAction, importBook } from "@/actions/books";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { OpenLibraryResult } from "@/lib/domain/openLibrary";

export default function BookSearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OpenLibraryResult[]>([]);
  const [importedKeys, setImportedKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isSearching, startSearch] = useTransition();
  const [importingKey, setImportingKey] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-serif text-2xl font-bold text-burgundy-dark">Search Open Library</h1>

      <form
        className="flex max-w-lg gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startSearch(async () => {
            const docs = await searchBooksAction(query);
            setResults(docs);
          });
        }}
      >
        <Input
          aria-label="Search books"
          placeholder="Search by title, author…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" disabled={isSearching || !query.trim()}>
          {isSearching ? "Searching…" : "Search"}
        </Button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((result) => {
          const imported = importedKeys.has(result.key);
          return (
            <li key={result.key} className="flex gap-3 rounded-xl border border-gold/30 bg-white p-3 shadow-sm">
              <div className="relative h-24 w-16 flex-shrink-0 overflow-hidden rounded-md bg-cream-dark">
                {result.cover_i ? (
                  <Image
                    src={`https://covers.openlibrary.org/b/id/${result.cover_i}-M.jpg`}
                    alt={`Cover of ${result.title}`}
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
              <div className="flex min-w-0 flex-1 flex-col justify-between">
                <div>
                  <p className="truncate font-serif font-semibold text-burgundy-dark">{result.title}</p>
                  {result.author_name && (
                    <p className="truncate text-sm text-burgundy-dark/70">{result.author_name[0]}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={imported ? "secondary" : "primary"}
                  disabled={imported || importingKey === result.key}
                  onClick={async () => {
                    setImportingKey(result.key);
                    const res = await importBook(result);
                    setImportingKey(null);
                    if (res.success) {
                      setImportedKeys((prev) => new Set(prev).add(result.key));
                    } else {
                      setError(res.error ?? "Failed to import book.");
                    }
                  }}
                >
                  {imported ? "Added ✓" : importingKey === result.key ? "Adding…" : "Add to library"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {!isSearching && results.length === 0 && query && (
        <p className="text-sm text-burgundy-dark/60">No results found. Try another search.</p>
      )}
    </div>
  );
}
