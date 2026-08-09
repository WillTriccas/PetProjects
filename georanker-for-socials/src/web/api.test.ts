import { describe, it, expect } from "vitest";
import { Repository } from "../db/repository.js";
import { RoundEngine } from "../engine/roundEngine.js";
import type { Player } from "../config.js";
import { buildDashboardData } from "./api.js";

const ROSTER: Player[] = [
  { displayName: "Alice", whatsappJid: "a@s.whatsapp.net" },
  { displayName: "Bob", whatsappJid: "b@s.whatsapp.net" },
  { displayName: "Charlie", whatsappJid: "c@s.whatsapp.net" },
];

function setup() {
  const repo = new Repository(":memory:");
  repo.syncPlayers(ROSTER);
  const players = repo.getActivePlayers();
  const engine = new RoundEngine(repo, "UTC");
  const id = (name: string) => players.find((p) => p.display_name === name)!.id;
  const day = (gameDate: string, scores: Record<string, number>) => {
    for (const [name, score] of Object.entries(scores)) {
      engine.recordScore({ playerId: id(name), score, source: "text", rawRef: null, gameDate });
    }
  };
  return { repo, day };
}

describe("buildDashboardData", () => {
  it("summarises standings, point hoarder and recent results", () => {
    const { repo, day } = setup();
    day("2026-01-01", { Alice: 100, Bob: 90, Charlie: 80 }); // Alice wins
    day("2026-01-02", { Alice: 70, Bob: 95, Charlie: 85 }); // Bob wins

    const data = buildDashboardData(repo, "UTC");

    expect(data.summary).toMatchObject({
      players: 3,
      gameDays: 2,
      submissions: 6,
      latestGameDate: "2026-01-02",
    });

    // Standings: Alice & Bob tie on 1 point (competition ranking), Charlie last.
    const alice = data.standings.find((s) => s.displayName === "Alice")!;
    const bob = data.standings.find((s) => s.displayName === "Bob")!;
    const charlie = data.standings.find((s) => s.displayName === "Charlie")!;
    expect(alice.points).toBe(1);
    expect(bob.points).toBe(1);
    expect(charlie.points).toBe(0);
    expect(charlie.position).toBe(3);

    // Point Hoarder tracks cumulative raw score: Bob 185 leads, Alice 170, Charlie 165.
    expect(data.pointHoarder.leaders).toEqual(["Bob"]);
    expect(data.pointHoarder.table[0]).toMatchObject({ position: 1, displayName: "Bob", total: 185 });
    const hoarderAlice = data.pointHoarder.table.find((t) => t.displayName === "Alice")!;
    expect(hoarderAlice.total).toBe(170);

    // Recent results are newest-first with the winning score.
    expect(data.recentResults[0]).toMatchObject({
      gameDate: "2026-01-02",
      winnerName: "Bob",
      topScore: 95,
    });
    expect(data.recentResults).toHaveLength(2);
  });

  it("returns safe empty shapes with no data", () => {
    const repo = new Repository(":memory:");
    repo.syncPlayers(ROSTER);
    const data = buildDashboardData(repo, "UTC");
    expect(data.summary.gameDays).toBe(0);
    expect(data.pointHoarder.leaders).toEqual([]);
    expect(data.records).toEqual([]);
    expect(data.recentResults).toEqual([]);
    expect(data.streaks.hot).toBeNull();
  });
});
