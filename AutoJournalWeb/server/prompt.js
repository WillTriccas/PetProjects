// Shared prompt logic — mirrors the iOS app's JournalGenerator, extended with
// the social/call signals the web app can ingest (which iOS cannot).

export const SYSTEM_PROMPT = `You are a personal journaling companion. You write a short, warm, first-person \
diary entry about the user's day, as if the user wrote it themselves that evening.

Hard rules:
- Ground EVERYTHING in the supplied photos and structured signals. Never invent \
people, places, events, or feelings that aren't supported by the evidence.
- Write in the first person ("I"), past tense, reflective but natural — not flowery.
- 2 to 3 short paragraphs. Absolute maximum 350 words. Shorter is fine.
- Weave in where I went, what I did, who I spoke to, and how my body moved through \
the day when that data is present, but don't just list stats — make it feel like a life lived.
- The goal is to help me stop and appreciate the day. Notice small, human details \
visible in the photos.
- If evidence is thin, keep it brief and honest rather than padding.
- Output only the diary entry text. No title, no headings, no bullet points.`;

export const MAX_WORDS = 350;

/**
 * Builds the human-readable context string that accompanies the hero images.
 * @param {object} signals
 */
export function buildUserContext(signals) {
  const lines = [];
  lines.push(`Date: ${signals.dateLabel}`);

  if (signals.places?.length) {
    lines.push('\nPlaces I visited (in order):');
    for (const p of signals.places) {
      lines.push(`- ${p.time ? `${p.name} (${p.time})` : p.name}`);
    }
  }

  if (signals.healthLine) {
    lines.push(`\nActivity & body: ${signals.healthLine}`);
  }

  if (signals.social?.length) {
    lines.push('\nPeople I interacted with (messages):');
    for (const s of signals.social) {
      lines.push(`- ${s}`);
    }
  }

  if (signals.calls?.length) {
    lines.push('\nCalls:');
    for (const c of signals.calls) {
      lines.push(`- ${c}`);
    }
  }

  if (signals.photos?.length) {
    lines.push(`\nPhotos & videos taken (${signals.photos.length} total):`);
    signals.photos.forEach((photo, i) => {
      let detail = `${i + 1}. ${photo.isVideo ? 'Video' : 'Photo'} at ${photo.time || 'unknown time'}`;
      if (photo.hasLocation) detail += ' (has location)';
      lines.push(detail);
    });
    lines.push('\nThe attached images are a representative selection, in time order.');
  }

  if (signals.manualNote) {
    lines.push(`\nMy own notes for the day: ${signals.manualNote}`);
  }

  lines.push('\nWrite my diary entry for this day now.');
  return lines.join('\n');
}

/** Word count (whitespace split). */
export function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Safety net: trim overly long output to the last sentence within the limit. */
export function trimToWordLimit(text, limit = MAX_WORDS) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= limit) return text.trim();
  const truncated = words.slice(0, limit).join(' ');
  const lastTerminator = Math.max(
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('!'),
    truncated.lastIndexOf('?')
  );
  return lastTerminator > 0 ? truncated.slice(0, lastTerminator + 1) : `${truncated}…`;
}
