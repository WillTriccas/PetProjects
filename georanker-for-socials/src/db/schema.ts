export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS players (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name  TEXT    NOT NULL,
  whatsapp_jid  TEXT,
  roster_key    TEXT    NOT NULL UNIQUE,
  active        INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS rounds (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  game_date        TEXT    NOT NULL,
  status           TEXT    NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open','playoff','resolved')),
  playoff_level    INTEGER NOT NULL DEFAULT 0,
  winner_player_id INTEGER REFERENCES players(id),
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  resolved_at      TEXT
);

-- Only one non-resolved round may exist at a time (partial unique index).
CREATE UNIQUE INDEX IF NOT EXISTS idx_rounds_single_open
  ON rounds (status) WHERE status IN ('open','playoff');

CREATE TABLE IF NOT EXISTS submissions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id      INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id     INTEGER NOT NULL REFERENCES players(id),
  playoff_level INTEGER NOT NULL DEFAULT 0,
  source        TEXT    NOT NULL CHECK (source IN ('image','text')),
  raw_ref       TEXT,
  score         REAL    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  submitted_at  TEXT,
  UNIQUE (round_id, player_id, playoff_level)
);

CREATE TABLE IF NOT EXISTS points (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id  INTEGER NOT NULL REFERENCES players(id),
  round_id   INTEGER NOT NULL REFERENCES rounds(id),
  points     INTEGER NOT NULL DEFAULT 1,
  awarded_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (round_id)
);

CREATE INDEX IF NOT EXISTS idx_submissions_round ON submissions(round_id);
CREATE INDEX IF NOT EXISTS idx_points_player ON points(player_id);

-- Dedupe key for chat-export processing so re-running or incremental exports
-- never double-count a message.
CREATE TABLE IF NOT EXISTS processed_messages (
  message_key TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Raw record of every scored *image* seen in a WhatsApp export. Only pictures
-- are official GeoRankl scores; a player's FIRST image of a day is their score,
-- later images are only consulted to break a playoff tie. Keyed by a stable
-- per-media dedupe key so re-uploading a full/overlapping export never re-reads
-- or double-counts an image. Days are recomputed from these rows, which is what
-- makes incremental uploads idempotent.
CREATE TABLE IF NOT EXISTS image_submissions (
  message_key   TEXT    PRIMARY KEY,
  game_date     TEXT    NOT NULL,
  player_id     INTEGER NOT NULL REFERENCES players(id),
  score         REAL,
  submitted_at  TEXT,
  attached_file TEXT,
  msg_order     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_image_submissions_day
  ON image_submissions (game_date, player_id, submitted_at, msg_order);

-- Players disqualified on a resolved day for posting no (readable) picture.
CREATE TABLE IF NOT EXISTS disqualifications (
  round_id   INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id  INTEGER NOT NULL REFERENCES players(id),
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (round_id, player_id)
);

-- All-time superlatives ("hall of records"). One row per record key; updated
-- once per resolved round so record-breaking moments can be called out.
CREATE TABLE IF NOT EXISTS records (
  key        TEXT    PRIMARY KEY,
  metric     REAL    NOT NULL,
  player_id  INTEGER REFERENCES players(id),
  game_date  TEXT,
  detail     TEXT,
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Small key/value store for app state (e.g. the randomised nostalgia clock).
CREATE TABLE IF NOT EXISTS app_state (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`;
