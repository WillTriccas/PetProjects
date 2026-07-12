import { toDay } from '../util.js';

// Parses a WhatsApp "Export chat" .txt file. Handles both the iOS bracketed
// format and the Android dash format, plus multi-line message bodies.
//
//   iOS:      [12/07/2026, 15:42:07] Alex: Hey, still on for later?
//   Android:  12/07/2026, 15:42 - Alex: Hey, still on for later?
//
// Dates are assumed day-first (DD/MM) unless the first field is > 12.

const IOS_RE = /^\[(\d{1,2})[/.](\d{1,2})[/.](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?\]\s?([^:]+?):\s(.*)$/i;
const ANDROID_RE = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?\s-\s([^:]+?):\s(.*)$/i;

const SYSTEM_HINTS = [
  'Messages and calls are end-to-end encrypted',
  'created group',
  'added you',
  'changed the subject',
  'changed this group',
  'joined using this group',
];

function buildDate(d, mo, y, h, min, s, ampm) {
  let day = parseInt(d, 10);
  let month = parseInt(mo, 10);
  // If clearly month-first (first field > 12, second <= 12), swap.
  if (day > 12 && month <= 12) {
    [day, month] = [day, month]; // already day-first
  } else if (month > 12 && day <= 12) {
    [day, month] = [month, day];
  }
  let year = parseInt(y, 10);
  if (year < 100) year += 2000;
  let hour = parseInt(h, 10);
  const minute = parseInt(min, 10);
  const second = s ? parseInt(s, 10) : 0;
  if (ampm) {
    const upper = ampm.toUpperCase();
    if (upper === 'PM' && hour < 12) hour += 12;
    if (upper === 'AM' && hour === 12) hour = 0;
  }
  return new Date(year, month - 1, day, hour, minute, second);
}

function isSystem(sender, text) {
  const line = `${sender} ${text}`;
  return SYSTEM_HINTS.some((h) => line.includes(h));
}

/**
 * @param {string} content raw file contents
 * @returns {Array<{day:string, source:'whatsapp', ts:string, sender:string, text:string}>}
 */
export function parseWhatsApp(content) {
  const lines = content.split(/\r?\n/);
  const rows = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.replace(/\u200e/g, ''); // strip LTR marks WhatsApp injects
    const m = line.match(IOS_RE) || line.match(ANDROID_RE);
    if (m) {
      if (current) pushRow(rows, current);
      const [, d, mo, y, h, min, s, ampm, sender, text] = m;
      const date = buildDate(d, mo, y, h, min, s, ampm);
      current = { date, sender: sender.trim(), text: text.trim() };
    } else if (current && line.trim()) {
      current.text += `\n${line.trim()}`; // continuation of a multi-line message
    }
  }
  if (current) pushRow(rows, current);
  return rows;
}

function pushRow(rows, cur) {
  if (Number.isNaN(cur.date.getTime())) return;
  if (isSystem(cur.sender, cur.text)) return;
  rows.push({
    day: toDay(cur.date),
    source: 'whatsapp',
    ts: cur.date.toISOString(),
    sender: cur.sender,
    text: cur.text,
  });
}

/** Summarise a day's WhatsApp messages into short prose lines per contact. */
export function summariseMessages(messages) {
  const byContact = new Map();
  for (const m of messages) {
    const key = m.sender || 'Unknown';
    byContact.set(key, (byContact.get(key) || 0) + 1);
  }
  return [...byContact.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([sender, count]) => `${sender} — ${count} message${count === 1 ? '' : 's'}`);
}
