import exifr from 'exifr';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { toDay } from './util.js';

/**
 * Extracts time + GPS metadata from an uploaded image/video and returns a row
 * ready for the `photos` table. Videos rarely carry EXIF, so they fall back to
 * the day the user assigned during upload (or today).
 *
 * @param {import('multer').File} file  multer file (has path, originalname, mimetype)
 * @param {string|null} fallbackDay     'YYYY-MM-DD' to use when no timestamp is found
 */
export async function photoRowFromUpload(file, fallbackDay) {
  const isVideo = file.mimetype.startsWith('video/');
  let takenAt = null;
  let lat = null;
  let lon = null;

  if (!isVideo) {
    try {
      const meta = await exifr.parse(file.path, { gps: true, pick: ['DateTimeOriginal', 'CreateDate', 'latitude', 'longitude'] });
      if (meta) {
        const dt = meta.DateTimeOriginal || meta.CreateDate;
        if (dt) takenAt = new Date(dt);
        if (typeof meta.latitude === 'number' && typeof meta.longitude === 'number') {
          lat = meta.latitude;
          lon = meta.longitude;
        }
      }
    } catch {
      // Corrupt or EXIF-less image — treat as undated.
    }
  }

  const takenIso = takenAt && !Number.isNaN(takenAt.getTime()) ? takenAt.toISOString() : null;
  const day = takenIso ? toDay(takenAt) : fallbackDay || toDay(new Date());

  return {
    id: randomUUID(),
    day,
    taken_at: takenIso,
    lat,
    lon,
    is_video: isVideo ? 1 : 0,
    filename: file.filename,
    mimetype: file.mimetype,
    place: null,
  };
}

/** Reads a stored photo file and returns a base64 `data:` URI for the model. */
export async function toDataUri(absPath, mimetype) {
  const buf = await readFile(absPath);
  // Non-JPEG images are still sent with their real mimetype; GitHub Models
  // accepts common formats. Videos are skipped by the caller.
  const type = mimetype.startsWith('image/') ? mimetype : 'image/jpeg';
  return `data:${type};base64,${buf.toString('base64')}`;
}
