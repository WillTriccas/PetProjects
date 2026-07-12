import { toDay } from '../util.js';

// Parses a call-log CSV export. Column names vary by exporter app, so we map
// headers heuristically. Expected-ish columns: a date/time, a contact/number,
// a call type/direction, and a duration.

function parseCsv(text) {
  const rows = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  for (const line of lines) {
    const fields = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i += 1; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        fields.push(cur); cur = '';
      } else {
        cur += ch;
      }
    }
    fields.push(cur);
    rows.push(fields.map((f) => f.trim()));
  }
  return rows;
}

function findColumn(headers, keywords) {
  return headers.findIndex((h) => keywords.some((k) => h.includes(k)));
}

function parseDurationSeconds(value) {
  if (!value) return 0;
  const v = value.trim().toLowerCase();
  if (/^\d+$/.test(v)) return parseInt(v, 10); // plain seconds
  const clock = v.match(/^(\d+):(\d{2})(?::(\d{2}))?$/); // HH:MM:SS or MM:SS
  if (clock) {
    const a = parseInt(clock[1], 10);
    const b = parseInt(clock[2], 10);
    const c = clock[3] ? parseInt(clock[3], 10) : null;
    return c !== null ? a * 3600 + b * 60 + c : a * 60 + b;
  }
  let seconds = 0;
  const hr = v.match(/(\d+)\s*h/);
  const min = v.match(/(\d+)\s*m/);
  const sec = v.match(/(\d+)\s*s/);
  if (hr) seconds += parseInt(hr[1], 10) * 3600;
  if (min) seconds += parseInt(min[1], 10) * 60;
  if (sec) seconds += parseInt(sec[1], 10);
  return seconds;
}

function normaliseDirection(value) {
  const v = (value || '').toLowerCase();
  if (v.includes('miss')) return 'missed';
  if (v.includes('out') || v.includes('dial')) return 'outgoing';
  if (v.includes('in') || v.includes('recv') || v.includes('receiv')) return 'incoming';
  return v || 'unknown';
}

/**
 * @param {string} text raw CSV
 * @returns {Array<{day:string, ts:string|null, contact:string, direction:string, duration_sec:number}>}
 */
export function parseCalls(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.toLowerCase());

  const dateCol = findColumn(headers, ['date', 'time', 'timestamp']);
  const timeCol = findColumn(headers, ['time']);
  const contactCol = findColumn(headers, ['name', 'contact', 'number', 'phone']);
  const dirCol = findColumn(headers, ['type', 'direction']);
  const durCol = findColumn(headers, ['duration', 'length']);

  const out = [];
  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i];
    let dateStr = dateCol >= 0 ? r[dateCol] : '';
    if (timeCol >= 0 && timeCol !== dateCol && r[timeCol] && !dateStr.includes(':')) {
      dateStr = `${dateStr} ${r[timeCol]}`;
    }
    const date = dateStr ? new Date(dateStr) : null;
    const validDate = date && !Number.isNaN(date.getTime());
    out.push({
      day: validDate ? toDay(date) : toDay(new Date()),
      ts: validDate ? date.toISOString() : null,
      contact: contactCol >= 0 ? r[contactCol] || 'Unknown' : 'Unknown',
      direction: normaliseDirection(dirCol >= 0 ? r[dirCol] : ''),
      duration_sec: durCol >= 0 ? parseDurationSeconds(r[durCol]) : 0,
    });
  }
  return out;
}

/** Short prose lines summarising a day's calls. */
export function summariseCalls(calls) {
  return calls.map((c) => {
    const mins = Math.round(c.duration_sec / 60);
    const dur = c.direction === 'missed'
      ? 'missed'
      : mins >= 1 ? `${mins} min` : `${c.duration_sec}s`;
    return `${c.contact} — ${c.direction}${c.direction === 'missed' ? '' : `, ${dur}`}`;
  });
}
