import { describe, expect, it } from "vitest";
import { resolveDay, type PlayerDay } from "./dayResolver.js";

/** Helper: build a player's day from a list of scores (null = unreadable). */
function player(
  playerId: number,
  displayName: string,
  scores: Array<number | null>,
): PlayerDay {
  return {
    playerId,
    displayName,
    images: scores.map((score, i) => ({
      score,
      submittedAt: `2025-07-17T09:${String(i).padStart(2, "0")}:00`,
    })),
  };
}

describe("resolveDay", () => {
  it("takes each player's first picture as their GeoRankl score", () => {
    const res = resolveDay("2025-07-17", [
      player(1, "Alice", [900, 12]),
      player(2, "Bob", [850, 8]),
      player(3, "Charlie", [700]),
    ]);
    expect(res.winnerPlayerId).toBe(1);
    expect(res.winningScore).toBe(900);
    expect(res.playoffs).toHaveLength(0);
    expect(res.dqs).toHaveLength(0);
    // level0 is sorted highest first and only uses the first picture.
    expect(res.level0.map((s) => s.score)).toEqual([900, 850, 700]);
  });

  it("disqualifies a player who posted no picture", () => {
    const res = resolveDay("2025-07-17", [
      player(1, "Alice", [900]),
      player(2, "Bob", []),
    ]);
    expect(res.winnerPlayerId).toBe(1);
    expect(res.dqs).toEqual([{ playerId: 2, displayName: "Bob" }]);
  });

  it("disqualifies a player whose first picture is unreadable", () => {
    const res = resolveDay("2025-07-17", [
      player(1, "Alice", [null, 900]),
      player(2, "Bob", [850]),
    ]);
    expect(res.winnerPlayerId).toBe(2);
    expect(res.dqs).toEqual([{ playerId: 1, displayName: "Alice" }]);
  });

  it("breaks a tie with the next picture (single playoff, higher wins)", () => {
    const res = resolveDay("2025-07-17", [
      player(1, "Alice", [900, 40]),
      player(2, "Bob", [900, 12]),
      player(3, "Charlie", [700]),
    ]);
    expect(res.playoffs).toHaveLength(1);
    expect(res.playoffs[0]!.level).toBe(1);
    expect(res.winnerPlayerId).toBe(1); // Alice's 40 beats Bob's 12
    expect(res.winningScore).toBe(900); // winning score stays the GeoRankl score
  });

  it("resolves a two-playoff day (17-July style)", () => {
    // Three-way tie on GeoRankl; first playoff still ties two of them, second decides.
    const res = resolveDay("2025-07-17", [
      player(1, "Alice", [900, 30, 15]),
      player(2, "Bob", [900, 30, 9]),
      player(3, "Charlie", [900, 12]),
    ]);
    expect(res.playoffs).toHaveLength(2);
    // Playoff 1: Charlie eliminated (12), Alice & Bob tie on 30.
    expect(res.playoffs[0]!.level).toBe(1);
    // Playoff 2: Alice's 15 beats Bob's 9.
    expect(res.playoffs[1]!.level).toBe(2);
    expect(res.winnerPlayerId).toBe(1);
    expect(res.winningScore).toBe(900);
  });

  it("eliminates a tied player who runs out of pictures", () => {
    const res = resolveDay("2025-07-17", [
      player(1, "Alice", [900, 30]),
      player(2, "Bob", [900]), // no tie-break picture
    ]);
    expect(res.winnerPlayerId).toBe(1);
    expect(res.playoffs[0]!.eliminated).toEqual([
      { playerId: 2, displayName: "Bob" },
    ]);
  });

  it("marks the day unresolved when no tied player can break the tie", () => {
    const res = resolveDay("2025-07-17", [
      player(1, "Alice", [900]),
      player(2, "Bob", [900]),
    ]);
    expect(res.unresolved).toBe(true);
    expect(res.winnerPlayerId).toBeNull();
  });

  it("returns no winner when everyone is disqualified", () => {
    const res = resolveDay("2025-07-17", [
      player(1, "Alice", []),
      player(2, "Bob", [null]),
    ]);
    expect(res.winnerPlayerId).toBeNull();
    expect(res.level0).toHaveLength(0);
    expect(res.dqs).toHaveLength(2);
  });

  it("lets a lone submitter win by default", () => {
    const res = resolveDay("2025-07-17", [
      player(1, "Alice", [420]),
      player(2, "Bob", []),
    ]);
    expect(res.winnerPlayerId).toBe(1);
    expect(res.winningScore).toBe(420);
  });
});
