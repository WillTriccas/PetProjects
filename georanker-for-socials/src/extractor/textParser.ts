/**
 * Parse a GeoRankl score from a free-text WhatsApp message.
 *
 * Handles messages like:
 *   "1234"            -> 1234
 *   "Score: 12,345"   -> 12345
 *   "i got 987 points"-> 987
 *   "gg 40/50"        -> 40  (first number when a keyword is present)
 *
 * Returns null when there is no number, or when the message is ambiguous
 * (multiple numbers and no scoring keyword to disambiguate).
 */
export function parseScoreFromText(text: string): number | null {
  if (!text) return null;

  // Normalise: strip thousands separators between digits ("12,345" -> "12345").
  const normalised = text.replace(/(\d),(\d)/g, "$1$2");

  const numberRegex = /-?\d+(?:\.\d+)?/g;
  const matches = [...normalised.matchAll(numberRegex)].map((m) => ({
    value: Number(m[0]),
    index: m.index ?? 0,
  }));

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0]!.value;

  // Multiple numbers: prefer the number that appears just after a scoring
  // keyword (e.g. "scored 987"); otherwise fall back to the nearest number.
  const keywordRegex = /score|points?|pts|got|scored/gi;
  const keywords = [...normalised.matchAll(keywordRegex)].map((m) => ({
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
  }));
  if (keywords.length > 0) {
    // First, look for the nearest number that comes *after* a keyword.
    let afterBest: { value: number; gap: number } | null = null;
    for (const match of matches) {
      for (const kw of keywords) {
        const gap = match.index - kw.end;
        if (gap >= 0 && (afterBest === null || gap < afterBest.gap)) {
          afterBest = { value: match.value, gap };
        }
      }
    }
    if (afterBest) return afterBest.value;

    // Otherwise, the nearest number by absolute distance to any keyword.
    let best = matches[0]!;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const match of matches) {
      for (const kw of keywords) {
        const dist = Math.abs(match.index - kw.start);
        if (dist < bestDist) {
          bestDist = dist;
          best = match;
        }
      }
    }
    return best.value;
  }

  // Ambiguous — several bare numbers, no keyword.
  return null;
}
