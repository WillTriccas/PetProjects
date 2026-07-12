import { join } from 'node:path';
import {
  photosForDay, messagesForDay, callsForDay, healthForDay, setPhotoPlace,
} from './db.js';
import { toDataUri } from './photos.js';
import { placeTrail } from './geocode.js';
import { summariseMessages } from './connectors/whatsapp.js';
import { summariseCalls } from './connectors/calls.js';
import {
  SYSTEM_PROMPT, buildUserContext, trimToWordLimit, wordCount,
} from './prompt.js';
import { complete } from './llm.js';
import { dateLabel, formatTime } from './util.js';

/** Evenly sample up to `max` image ids across the time-ordered photos. */
function selectHeroes(photos, max) {
  const images = photos.filter((p) => !p.is_video);
  if (images.length <= max) return images.map((p) => p.id);
  const picked = [];
  const step = images.length / max;
  for (let i = 0; i < max; i += 1) {
    const idx = Math.min(Math.floor((i + 0.5) * step), images.length - 1);
    picked.push(images[idx].id);
  }
  return [...new Set(picked)];
}

/**
 * Runs the full pipeline for a day and returns an entry object (not persisted).
 * @param {object} opts { day, manualNote, token, model, maxPhotos, uploadsDir }
 */
export async function generateEntry({ day, manualNote = '', token, model, maxPhotos = 6, uploadsDir }) {
  const photos = photosForDay(day);
  const messages = messagesForDay(day);
  const calls = callsForDay(day);
  const health = healthForDay(day);

  const hasAny = photos.length || messages.length || calls.length || health || manualNote;
  if (!hasAny) {
    throw new Error('Nothing to journal for this day yet — import some photos, messages, calls, or activity first.');
  }

  // Places from photo GPS (also cache the resolved name on each photo row).
  const located = photos.filter((p) => typeof p.lat === 'number' && typeof p.lon === 'number');
  const visits = located.length ? await placeTrail(located) : [];
  for (const p of located) {
    const near = visits.find((v) => Math.abs(v.lat - p.lat) < 0.01 && Math.abs(v.lon - p.lon) < 0.01);
    if (near) setPhotoPlace(p.id, near.name);
  }

  // Hero images → base64.
  const heroIds = selectHeroes(photos, maxPhotos);
  const heroPhotos = heroIds
    .map((id) => photos.find((p) => p.id === id))
    .filter(Boolean);
  const imageDataUris = [];
  for (const p of heroPhotos) {
    try {
      imageDataUris.push(await toDataUri(join(uploadsDir, p.filename), p.mimetype));
    } catch {
      // Missing file on disk — skip.
    }
  }

  // Assemble signals for the prompt.
  const signals = {
    dateLabel: dateLabel(day),
    places: visits.map((v) => ({ name: v.name, time: v.time ? formatTime(v.time) : null })),
    healthLine: health?.summary?.narrativeLine || '',
    social: summariseMessages(messages),
    calls: summariseCalls(calls),
    photos: photos.map((p) => ({
      isVideo: !!p.is_video,
      time: p.taken_at ? formatTime(p.taken_at) : null,
      hasLocation: typeof p.lat === 'number',
    })),
    manualNote,
  };

  const userText = buildUserContext(signals);
  const raw = await complete({
    token, model, system: SYSTEM_PROMPT, userText, imageDataUris,
  });
  const narrative = trimToWordLimit(raw);

  return {
    day,
    narrative,
    place_trail: visits.map((v) => v.name),
    health_summary: signals.healthLine,
    hero_photos: heroIds,
    photo_count: photos.length,
    manual_note: manualNote,
    generated_at: new Date().toISOString(),
    model,
    word_count: wordCount(narrative),
  };
}
