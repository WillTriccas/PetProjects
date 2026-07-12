export type RoundStatus = "open" | "playoff" | "resolved";
export type SubmissionSource = "image" | "text";

export interface PlayerRow {
  id: number;
  display_name: string;
  whatsapp_jid: string | null;
  roster_key: string;
  active: number;
}

export interface RoundRow {
  id: number;
  game_date: string;
  status: RoundStatus;
  playoff_level: number;
  winner_player_id: number | null;
  created_at: string;
  resolved_at: string | null;
}

export interface SubmissionRow {
  id: number;
  round_id: number;
  player_id: number;
  playoff_level: number;
  source: SubmissionSource;
  raw_ref: string | null;
  score: number;
  created_at: string;
  submitted_at: string | null;
}

export interface TallyEntry {
  playerId: number;
  displayName: string;
  points: number;
}

/** A row in the all-time "hall of records" table. */
export interface RecordRow {
  key: string;
  metric: number;
  player_id: number | null;
  game_date: string | null;
  detail: string | null;
  updated_at: string;
}

/** A per-player score line within a single day/round (level-0 game). */
export interface PlayerScore {
  playerId: number;
  displayName: string;
  score: number;
  /** Actual chat time of the submission (YYYY-MM-DD HH:MM:SS), if known. */
  submittedAt: string | null;
}
