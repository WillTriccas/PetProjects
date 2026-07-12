export type RoundStatus = "open" | "playoff" | "resolved";
export type SubmissionSource = "image" | "text";

export interface PlayerRow {
  id: number;
  display_name: string;
  whatsapp_jid: string;
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
}

export interface TallyEntry {
  playerId: number;
  displayName: string;
  points: number;
}
