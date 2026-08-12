/**
 * Open Library integration: search for books and map API results into the
 * shape used to insert rows into the `books` table. Server-side only.
 */

const OPEN_LIBRARY_SEARCH_URL = "https://openlibrary.org/search.json";
const FETCH_TIMEOUT_MS = 8000;

export interface OpenLibraryResult {
  key: string;
  title: string;
  author_name?: string[];
  cover_i?: number;
  first_publish_year?: number;
  number_of_pages_median?: number;
  first_sentence?: string[] | string;
}

export interface BookInsert {
  open_library_key: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  description: string | null;
  page_count: number | null;
  published_year: number | null;
}

interface OpenLibrarySearchResponse {
  docs?: OpenLibraryResult[];
}

/**
 * Search Open Library by free-text query. Returns an empty array (never
 * throws) if the query is blank, the request times out, or the API errors.
 */
export async function searchBooks(query: string): Promise<OpenLibraryResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const url = `${OPEN_LIBRARY_SEARCH_URL}?q=${encodeURIComponent(trimmed)}&limit=20`;
    const res = await fetch(url, { signal: controller.signal });

    if (!res.ok) {
      return [];
    }

    const data = (await res.json()) as OpenLibrarySearchResponse;
    return data.docs ?? [];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/** Build a cover image URL for a given Open Library cover id, at the requested size. */
export function coverUrl(coverId: number, size: "S" | "M" | "L" = "M"): string {
  return `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`;
}

/** Map a raw Open Library search result into the shape used to insert a book row. */
export function mapToBook(result: OpenLibraryResult): BookInsert {
  const firstSentence = Array.isArray(result.first_sentence)
    ? result.first_sentence[0]
    : result.first_sentence;

  return {
    open_library_key: result.key,
    title: result.title,
    author: result.author_name?.[0] ?? null,
    cover_url: result.cover_i ? coverUrl(result.cover_i, "L") : null,
    description: firstSentence ?? null,
    page_count: result.number_of_pages_median ?? null,
    published_year: result.first_publish_year ?? null,
  };
}
