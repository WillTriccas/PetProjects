import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(join(dataDir, 'journal.db'));
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS entries (
    day            TEXT PRIMARY KEY,          -- 'YYYY-MM-DD'
    narrative      TEXT NOT NULL,
    place_trail    TEXT NOT NULL DEFAULT '[]',
    health_summary TEXT NOT NULL DEFAULT '',
    hero_photos    TEXT NOT NULL DEFAULT '[]',
    photo_count    INTEGER NOT NULL DEFAULT 0,
    manual_note    TEXT NOT NULL DEFAULT '',
    generated_at   TEXT NOT NULL,
    model          TEXT NOT NULL DEFAULT '',
    word_count     INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS photos (
    id        TEXT PRIMARY KEY,
    day       TEXT NOT NULL,
    taken_at  TEXT,
    lat       REAL,
    lon       REAL,
    is_video  INTEGER NOT NULL DEFAULT 0,
    filename  TEXT NOT NULL,
    mimetype  TEXT NOT NULL,
    place     TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_photos_day ON photos(day);

  CREATE TABLE IF NOT EXISTS messages (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    day    TEXT NOT NULL,
    source TEXT NOT NULL,               -- 'whatsapp' | 'messenger'
    ts     TEXT,
    sender TEXT,
    text   TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_messages_day ON messages(day);

  CREATE TABLE IF NOT EXISTS calls (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    day          TEXT NOT NULL,
    ts           TEXT,
    contact      TEXT,
    direction    TEXT,                  -- 'incoming' | 'outgoing' | 'missed'
    duration_sec INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_calls_day ON calls(day);

  CREATE TABLE IF NOT EXISTS health (
    day          TEXT PRIMARY KEY,
    source       TEXT NOT NULL DEFAULT '',
    summary_json TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

// ---- Entries ----

export function upsertEntry(e) {
  db.prepare(`
    INSERT INTO entries (day, narrative, place_trail, health_summary, hero_photos,
                         photo_count, manual_note, generated_at, model, word_count)
    VALUES (@day, @narrative, @place_trail, @health_summary, @hero_photos,
            @photo_count, @manual_note, @generated_at, @model, @word_count)
    ON CONFLICT(day) DO UPDATE SET
      narrative=@narrative, place_trail=@place_trail, health_summary=@health_summary,
      hero_photos=@hero_photos, photo_count=@photo_count, manual_note=@manual_note,
      generated_at=@generated_at, model=@model, word_count=@word_count
  `).run({
    ...e,
    place_trail: JSON.stringify(e.place_trail ?? []),
    hero_photos: JSON.stringify(e.hero_photos ?? []),
  });
}

export function listEntries() {
  return db.prepare('SELECT * FROM entries ORDER BY day DESC').all().map(hydrateEntry);
}

export function getEntry(day) {
  const row = db.prepare('SELECT * FROM entries WHERE day = ?').get(day);
  return row ? hydrateEntry(row) : null;
}

export function deleteEntry(day) {
  db.prepare('DELETE FROM entries WHERE day = ?').run(day);
}

function hydrateEntry(row) {
  return {
    ...row,
    place_trail: JSON.parse(row.place_trail || '[]'),
    hero_photos: JSON.parse(row.hero_photos || '[]'),
  };
}

// ---- Photos ----

export function insertPhoto(p) {
  db.prepare(`
    INSERT INTO photos (id, day, taken_at, lat, lon, is_video, filename, mimetype, place)
    VALUES (@id, @day, @taken_at, @lat, @lon, @is_video, @filename, @mimetype, @place)
  `).run(p);
}

export function photosForDay(day) {
  return db.prepare('SELECT * FROM photos WHERE day = ? ORDER BY taken_at ASC').all(day);
}

export function getPhoto(id) {
  return db.prepare('SELECT * FROM photos WHERE id = ?').get(id);
}

export function setPhotoPlace(id, place) {
  db.prepare('UPDATE photos SET place = ? WHERE id = ?').run(place, id);
}

// ---- Messages ----

export function insertMessages(rows) {
  const stmt = db.prepare(
    'INSERT INTO messages (day, source, ts, sender, text) VALUES (@day, @source, @ts, @sender, @text)'
  );
  db.exec('BEGIN');
  try {
    for (const r of rows) stmt.run(r);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function messagesForDay(day) {
  return db.prepare('SELECT * FROM messages WHERE day = ? ORDER BY ts ASC').all(day);
}

// ---- Calls ----

export function insertCalls(rows) {
  const stmt = db.prepare(
    'INSERT INTO calls (day, ts, contact, direction, duration_sec) VALUES (@day, @ts, @contact, @direction, @duration_sec)'
  );
  db.exec('BEGIN');
  try {
    for (const r of rows) stmt.run(r);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function callsForDay(day) {
  return db.prepare('SELECT * FROM calls WHERE day = ? ORDER BY ts ASC').all(day);
}

// ---- Health ----

export function upsertHealth(day, source, summary) {
  db.prepare(`
    INSERT INTO health (day, source, summary_json) VALUES (?, ?, ?)
    ON CONFLICT(day) DO UPDATE SET source=excluded.source, summary_json=excluded.summary_json
  `).run(day, source, JSON.stringify(summary));
}

export function healthForDay(day) {
  const row = db.prepare('SELECT * FROM health WHERE day = ?').get(day);
  return row ? { source: row.source, summary: JSON.parse(row.summary_json || '{}') } : null;
}

// ---- Settings ----

export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `).run(key, String(value));
}

/// Distinct days that have any signal, for the UI date hints.
export function daysWithData() {
  const rows = db.prepare(`
    SELECT day FROM photos
    UNION SELECT day FROM messages
    UNION SELECT day FROM calls
    UNION SELECT day FROM health
    ORDER BY day DESC
  `).all();
  return rows.map((r) => r.day);
}

export default db;
