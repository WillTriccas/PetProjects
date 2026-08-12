/**
 * Pure rating/aggregation helpers for Wine & Words reviews.
 * Ratings are on a 1–5 scale in half-star increments (1, 1.5, 2, ..., 5).
 */

export interface RatingAggregate {
  average: number;
  count: number;
  distribution: Record<string, number>;
}

export interface StarBreakdownEntry {
  stars: number;
  count: number;
  pct: number;
}

/** Round an arbitrary number to the nearest half-star (0.5 increment), clamped to [1, 5]. */
export function roundToHalf(n: number): number {
  const clamped = Math.min(5, Math.max(1, n));
  return Math.round(clamped * 2) / 2;
}

/** Format a rating for display, always showing one decimal place, e.g. "3.5" or "4.0". */
export function formatRating(n: number): string {
  return n.toFixed(1);
}

/**
 * Aggregate a list of raw ratings into an average, count, and distribution keyed
 * by the string-formatted half-star value (e.g. "4.5" -> 3).
 */
export function aggregate(ratings: number[]): RatingAggregate {
  if (ratings.length === 0) {
    return { average: 0, count: 0, distribution: {} };
  }

  const distribution: Record<string, number> = {};
  let sum = 0;

  for (const raw of ratings) {
    const rounded = roundToHalf(raw);
    sum += rounded;
    const key = formatRating(rounded);
    distribution[key] = (distribution[key] ?? 0) + 1;
  }

  const average = roundHalfAway(sum / ratings.length, 2);

  return { average, count: ratings.length, distribution };
}

/** Round to `decimals` decimal places using standard "round half away from zero" semantics. */
function roundHalfAway(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * factor) / factor;
}

/**
 * Produce a breakdown of whole-star buckets (1..5) with counts and percentages
 * of the total, useful for rendering a bar-chart style histogram. Half-star
 * ratings are bucketed into the nearest whole star for display purposes
 * (e.g. 3.5 and 4.0 both count toward the "4" bucket via rounding up on .5).
 */
export function starBreakdown(ratings: number[]): StarBreakdownEntry[] {
  const buckets: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const total = ratings.length;

  for (const raw of ratings) {
    const rounded = roundToHalf(raw);
    const bucket = Math.min(5, Math.max(1, Math.round(rounded)));
    buckets[bucket] = (buckets[bucket] ?? 0) + 1;
  }

  return [5, 4, 3, 2, 1].map((stars) => {
    const count = buckets[stars] ?? 0;
    const pct = total === 0 ? 0 : roundHalfAway((count / total) * 100, 1);
    return { stars, count, pct };
  });
}
