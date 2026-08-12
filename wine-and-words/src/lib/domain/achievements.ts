/**
 * Pure "nostalgia" / achievement helpers: attendance streaks, membership
 * anniversaries, and the club's most popular meeting month.
 */

export interface Anniversary {
  years: number;
  label: string;
}

export interface PopularMonthResult {
  month: string;
  count: number;
}

export interface AchievementProfileInput {
  displayName?: string;
}

export interface Achievement {
  id: string;
  label: string;
  description: string;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** A gap larger than this many days between consecutive attended events breaks a streak. */
const STREAK_GAP_DAYS = 45;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Compute the current attendance streak: the number of consecutive attended
 * events (most recent first) with no gap larger than STREAK_GAP_DAYS between
 * them. A book club typically meets monthly, so a ~45 day window tolerates a
 * skipped week without breaking the streak, while a multi-month gap resets it.
 */
export function computeStreak(attendedEventDates: Date[]): number {
  if (attendedEventDates.length === 0) return 0;

  const sorted = [...attendedEventDates]
    .map((d) => new Date(d))
    .sort((a, b) => b.getTime() - a.getTime());

  let streak = 1;
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i]!;
    const prev = sorted[i + 1]!;
    const gapDays = (current.getTime() - prev.getTime()) / MS_PER_DAY;
    if (gapDays <= STREAK_GAP_DAYS) {
      streak += 1;
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Detect whether `now` falls on (or within 3 days of) a whole-year
 * anniversary of `joinedAt`. Returns an empty array when there is no
 * anniversary to celebrate right now.
 */
export function findAnniversaries(joinedAt: Date, now: Date): Anniversary[] {
  const results: Anniversary[] = [];
  const WINDOW_DAYS = 3;

  const joined = new Date(joinedAt);
  const yearsElapsed = now.getFullYear() - joined.getFullYear();

  for (const years of [yearsElapsed, yearsElapsed + 1]) {
    if (years <= 0) continue;
    const anniversaryDate = new Date(joined);
    anniversaryDate.setFullYear(joined.getFullYear() + years);

    const diffDays = Math.abs((now.getTime() - anniversaryDate.getTime()) / MS_PER_DAY);
    if (diffDays <= WINDOW_DAYS) {
      results.push({
        years,
        label: `${years} Year${years === 1 ? "" : "s"} of Wine & Words`,
      });
    }
  }

  return results;
}

/**
 * Determine which calendar month the club meets in most often. Ties are
 * broken by earliest month in the calendar year (January first) for a
 * deterministic result.
 */
export function popularMonth(eventDates: Date[]): PopularMonthResult | null {
  if (eventDates.length === 0) return null;

  const counts = new Array(12).fill(0) as number[];
  for (const date of eventDates) {
    const monthIndex = new Date(date).getMonth();
    counts[monthIndex] = (counts[monthIndex] ?? 0) + 1;
  }

  let bestIndex = -1;
  let bestCount = 0;
  for (let i = 0; i < counts.length; i++) {
    const count = counts[i] ?? 0;
    if (count > bestCount) {
      bestCount = count;
      bestIndex = i;
    }
  }

  if (bestIndex === -1) return null;

  return { month: MONTH_NAMES[bestIndex]!, count: bestCount };
}

/**
 * Compute the list of achievements a member has unlocked based on their
 * attendance count, review count, and current streak. Only achieved badges
 * are returned.
 */
export function computeAchievements(
  _profile: AchievementProfileInput,
  attendanceCount: number,
  reviewCount: number,
  streak: number
): Achievement[] {
  const achievements: Achievement[] = [];

  if (attendanceCount >= 1) {
    achievements.push({
      id: "first_event",
      label: "First Pour",
      description: "Attended your first Wine & Words event.",
    });
  }
  if (attendanceCount >= 5) {
    achievements.push({
      id: "regular",
      label: "Regular",
      description: "Attended 5 or more events.",
    });
  }
  if (attendanceCount >= 20) {
    achievements.push({
      id: "veteran",
      label: "Club Veteran",
      description: "Attended 20 or more events.",
    });
  }
  if (reviewCount >= 5) {
    achievements.push({
      id: "critic",
      label: "Budding Critic",
      description: "Left 5 or more reviews.",
    });
  }
  if (reviewCount >= 20) {
    achievements.push({
      id: "prolific_critic",
      label: "Prolific Critic",
      description: "Left 20 or more reviews.",
    });
  }
  if (streak >= 3) {
    achievements.push({
      id: "on_a_roll",
      label: "On a Roll",
      description: "Attended 3 events in a row without missing one.",
    });
  }
  if (streak >= 6) {
    achievements.push({
      id: "unstoppable",
      label: "Unstoppable",
      description: "Attended 6 events in a row without missing one.",
    });
  }

  return achievements;
}
