import { describe, it, expect } from "vitest";
import { formatTally, formatWinnerAnnouncement, formatPlayoffAnnouncement } from "./format.js";
import type { PlayerRow, TallyEntry } from "../db/models.js";

const tally: TallyEntry[] = [
  { playerId: 1, displayName: "Alice", points: 5 },
  { playerId: 2, displayName: "Bob", points: 5 },
  { playerId: 3, displayName: "Charlie", points: 2 },
];

function player(name: string): PlayerRow {
  return { id: 1, display_name: name, whatsapp_jid: "x", roster_key: name, active: 1 };
}

describe("format", () => {
  it("shares the same position for tied points", () => {
    const out = formatTally(tally);
    expect(out).toContain("🥇 Alice — 5");
    expect(out).toContain("🥇 Bob — 5");
    // Charlie is third, not second, because two players share first.
    expect(out).toContain("🥉 Charlie — 2");
  });

  it("formats a winner announcement with a thousands-separated score", () => {
    const out = formatWinnerAnnouncement(player("Alice"), 12345, tally);
    expect(out).toContain("Alice");
    expect(out).toContain("12,345");
    expect(out).toContain("Standings");
  });

  it("names all tied players in a playoff announcement", () => {
    const out = formatPlayoffAnnouncement([player("Alice"), player("Bob")], 1);
    expect(out).toContain("Alice");
    expect(out).toContain("Bob");
    expect(out.toLowerCase()).toContain("tie-break");
  });

  it("labels deeper playoff rounds", () => {
    const out = formatPlayoffAnnouncement([player("Alice"), player("Bob")], 2);
    expect(out).toContain("tie-break round 2");
  });
});
