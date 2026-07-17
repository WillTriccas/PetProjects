// Small date helpers shared across the server.

/** Local 'YYYY-MM-DD' for a Date. */
export function toDay(date) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Short local time label, e.g. "3:42 PM". Returns '' for invalid dates. */
export function formatTime(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Long human date label, e.g. "Saturday, 12 July 2026". */
export function dateLabel(day) {
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString([], {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/** Today's local day. */
export function today() {
  return toDay(new Date());
}
