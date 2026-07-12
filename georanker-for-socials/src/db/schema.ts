export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS players (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name  TEXT    NOT NULL,
  whatsapp_jid  TEXT    NOT NULL UNIQUE,
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
`;
