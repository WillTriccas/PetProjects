import { describe, it, expect, vi, afterEach } from "vitest";
import { searchBooks, mapToBook, coverUrl, type OpenLibraryResult } from "@/lib/domain/openLibrary";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("mapToBook", () => {
  it("maps a realistic Open Library search result to a book insert shape", () => {
    const fixture: OpenLibraryResult = {
      key: "/works/OL45804W",
      title: "Fahrenheit 451",
      author_name: ["Ray Bradbury"],
      cover_i: 258027,
      first_publish_year: 1953,
      number_of_pages_median: 194,
      first_sentence: ["It was a pleasure to burn."],
    };

    const book = mapToBook(fixture);

    expect(book).toEqual({
      open_library_key: "/works/OL45804W",
      title: "Fahrenheit 451",
      author: "Ray Bradbury",
      cover_url: "https://covers.openlibrary.org/b/id/258027-L.jpg",
      description: "It was a pleasure to burn.",
      page_count: 194,
      published_year: 1953,
    });
  });

  it("handles a plain string first_sentence field", () => {
    const fixture: OpenLibraryResult = {
      key: "/works/OL123W",
      title: "Some Book",
      first_sentence: "Once upon a time.",
    };
    const book = mapToBook(fixture);
    expect(book.description).toBe("Once upon a time.");
  });

  it("gracefully falls back to null fields when data is missing", () => {
    const fixture: OpenLibraryResult = {
      key: "/works/OL999W",
      title: "Mystery Book",
    };
    const book = mapToBook(fixture);
    expect(book.author).toBeNull();
    expect(book.cover_url).toBeNull();
    expect(book.description).toBeNull();
    expect(book.page_count).toBeNull();
    expect(book.published_year).toBeNull();
  });
});

describe("coverUrl", () => {
  it("builds a cover url with the requested size", () => {
    expect(coverUrl(12345, "S")).toBe("https://covers.openlibrary.org/b/id/12345-S.jpg");
    expect(coverUrl(12345)).toBe("https://covers.openlibrary.org/b/id/12345-M.jpg");
  });
});

describe("searchBooks", () => {
  it("returns an empty array for a blank query without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchBooks("   ");

    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns docs from a successful response", async () => {
    const docs: OpenLibraryResult[] = [
      { key: "/works/OL1W", title: "Book One" },
      { key: "/works/OL2W", title: "Book Two" },
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ docs }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchBooks("dune");

    expect(result).toEqual(docs);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0]![0] as string;
    expect(calledUrl).toContain("q=dune");
  });

  it("returns an empty array when the response is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchBooks("dune");
    expect(result).toEqual([]);
  });

  it("returns an empty array when fetch throws", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchBooks("dune");
    expect(result).toEqual([]);
  });
});
