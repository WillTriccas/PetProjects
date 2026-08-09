/**
 * Parser for WhatsApp "Export chat" .txt transcripts.
 *
 * Supports both the iOS format:
 *   [12/07/2026, 18:23:45] Alice: 9050
 *   [12/07/2026, 18:24:01] Bob: ‎<attached: 00000042-PHOTO-2026-07-12.jpg>
 * and the Android format:
 *   12/07/2026, 18:23 - Alice: 9050
 *   12/07/2026, 18:24 - Bob: IMG-20260712-WA0001.jpg (file attached)
 *
 * Multi-line message bodies are joined. System lines (no "Sender:") are kept
 * with a null sender so they are ignored downstream.
 */

export interface ParsedExportMessage {
  /** Position in the file — preserves true chronological order. */
  order: number;
  /** Raw date token exactly as written; used to detect day boundaries. */
  dayKey: string;
  /** Best-effort normalised date (YYYY-MM-DD), or null if unparseable. */
  isoDate: string | null;
  /** Best-effort local timestamp (YYYY-MM-DD HH:MM:SS), or null if unparseable. */
  isoTimestamp: string | null;
  /** Sender name as written in the export, or null for system messages. */
  sender: string | null;
  /** Message text (media placeholders stripped where sensible). */
  body: string;
  /** Attached media filename, if the message referenced one. */
  attachedFile: string | null;
}

const IOS_HEADER =
  /^\[(\d{1,2}[/.]\d{1,2}[/.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][Mm])?)\]\s*(.*)$/;
const ANDROID_HEADER =
  /^(\d{1,2}[/.]\d{1,2}[/.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][Mm])?)\s-\s*(.*)$/;

const DIRECTION_MARKS = /[\u200e\u200f\u202a-\u202e]/g;

interface HeaderMatch {
  dayKey: string;
  timeKey: string;
  rest: string;
}

function matchHeader(line: string): HeaderMatch | null {
  // WhatsApp prefixes attachment-only lines (a bare photo/video with no caption)
  // with a U+200E LRM mark BEFORE the "[" timestamp. Strip any leading bidi/
  // direction marks first, otherwise the `^\[` anchor fails and the line is
  // mistaken for a continuation of the previous message — silently attributing
  // the media to the wrong sender.
  const cleaned = line.replace(/^[\u200e\u200f\u202a-\u202e\ufeff]+/, "");
  const m = IOS_HEADER.exec(cleaned) ?? ANDROID_HEADER.exec(cleaned);
  if (!m) return null;
  return {
    dayKey: m[1]!,
    timeKey: m[2] ?? "",
    rest: (m[3] ?? "").replace(DIRECTION_MARKS, ""),
  };
}

/** Normalise a time token to HH:MM:SS (24h). Handles 12h AM/PM and missing seconds. */
function normaliseTime(timeKey: string): string | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([APap][Mm])?$/.exec(timeKey.trim());
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const second = m[3] ? Number(m[3]) : 0;
  const meridiem = m[4]?.toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59 || second > 59) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

function splitSenderBody(rest: string): { sender: string | null; body: string } {
  const m = /^([^:]{1,80}):\s?([\s\S]*)$/.exec(rest);
  if (!m) return { sender: null, body: rest.trim() };
  return { sender: m[1]!.trim(), body: m[2]!.trim() };
}

function detectAttachment(body: string): string | null {
  const attached = /<attached:\s*([^>]+)>/i.exec(body);
  if (attached) return attached[1]!.trim();
  const fileAttached = /([\w.-]+\.(?:jpg|jpeg|png|webp|heic))\s*\(file attached\)/i.exec(body);
  if (fileAttached) return fileAttached[1]!.trim();
  return null;
}

/** Best-effort YYYY-MM-DD. Ambiguous D/M vs M/D defaults to day-first (UK). */
function normaliseDate(dayKey: string): string | null {
  const parts = dayKey.split(/[/.]/).map((p) => p.trim());
  if (parts.length !== 3) return null;
  let [a, b, y] = parts.map((p) => Number(p)) as [number, number, number];
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(y)) return null;
  if (y < 100) y += 2000;
  let day: number;
  let month: number;
  if (a > 12 && b <= 12) {
    day = a;
    month = b;
  } else if (b > 12 && a <= 12) {
    month = a;
    day = b;
  } else {
    // Ambiguous — assume day-first.
    day = a;
    month = b;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseExport(text: string): ParsedExportMessage[] {
  const lines = text.split(/\r?\n/);
  const messages: ParsedExportMessage[] = [];
  let order = 0;

  for (const line of lines) {
    const header = matchHeader(line);
    if (header) {
      const { sender, body } = splitSenderBody(header.rest);
      const isoDate = normaliseDate(header.dayKey);
      const time = normaliseTime(header.timeKey);
      messages.push({
        order: order++,
        dayKey: header.dayKey,
        isoDate,
        isoTimestamp: isoDate && time ? `${isoDate} ${time}` : null,
        sender,
        body,
        attachedFile: detectAttachment(body),
      });
    } else if (messages.length > 0) {
      // Continuation of the previous message body.
      const prev = messages[messages.length - 1]!;
      const extra = line.replace(DIRECTION_MARKS, "");
      prev.body = prev.body ? `${prev.body}\n${extra}` : extra;
      if (!prev.attachedFile) prev.attachedFile = detectAttachment(extra);
    }
    // Leading non-header lines (rare) are ignored.
  }

  return messages;
}
