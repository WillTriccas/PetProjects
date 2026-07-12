// WHOOP connector — pulls activity/recovery/sleep for a day from the WHOOP
// Developer API (v1) using an OAuth access token. See README for how to get one.

const BASE = 'https://api.prod.whoop.com/developer/v1';

function dayRange(day) {
  const start = new Date(`${day}T00:00:00`);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function get(path, token, params) {
  const url = new URL(`${BASE}${path}`);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new Error('WHOOP token invalid or expired.');
  if (!res.ok) throw new Error(`WHOOP API error ${res.status}`);
  return res.json();
}

/**
 * @returns {Promise<{strain:number|null, avgHr:number|null, calories:number|null,
 *   sleepHours:number|null, workouts:Array, narrativeLine:string}>}
 */
export async function fetchWhoopDay(day, token) {
  const { start, end } = dayRange(day);

  const [cycles, sleeps, workouts] = await Promise.all([
    get('/cycle', token, { start, end }).catch(() => null),
    get('/activity/sleep', token, { start, end }).catch(() => null),
    get('/activity/workout', token, { start, end }).catch(() => null),
  ]);

  const cycle = cycles?.records?.[0];
  const strain = cycle?.score?.strain ?? null;
  const avgHr = cycle?.score?.average_heart_rate ?? null;
  const kj = cycle?.score?.kilojoule ?? null;
  const calories = kj != null ? Math.round(kj / 4.184) : null;

  let sleepHours = null;
  const sleepRecord = sleeps?.records?.find((r) => r?.score?.stage_summary);
  if (sleepRecord) {
    const s = sleepRecord.score.stage_summary;
    const asleepMs =
      (s.total_light_sleep_time_milli || 0) +
      (s.total_slow_wave_sleep_time_milli || 0) +
      (s.total_rem_sleep_time_milli || 0);
    if (asleepMs > 0) sleepHours = +(asleepMs / 3600000).toFixed(1);
  }

  const workoutList = (workouts?.records || []).map((w) => {
    const minutes = w.start && w.end
      ? Math.round((new Date(w.end) - new Date(w.start)) / 60000)
      : null;
    return { type: 'Workout', minutes, strain: w?.score?.strain ?? null };
  });

  return {
    strain: strain != null ? +strain.toFixed(1) : null,
    avgHr,
    calories,
    sleepHours,
    workouts: workoutList,
    narrativeLine: buildNarrative({ strain, avgHr, calories, sleepHours, workoutList }),
  };
}

function buildNarrative({ strain, avgHr, calories, sleepHours, workoutList }) {
  const parts = [];
  if (strain != null) parts.push(`WHOOP strain ${strain.toFixed(1)}`);
  if (workoutList.length) {
    parts.push(`workouts: ${workoutList.map((w) => (w.minutes ? `${w.type} (${w.minutes} min)` : w.type)).join(', ')}`);
  }
  if (calories != null) parts.push(`${calories} kcal burned`);
  if (avgHr != null) parts.push(`avg HR ${avgHr} bpm`);
  if (sleepHours != null) parts.push(`${sleepHours} h sleep`);
  return parts.length ? parts.join(' · ') : 'No WHOOP data for this day.';
}
