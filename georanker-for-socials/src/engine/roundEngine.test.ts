import { describe, it, expect, beforeEach } from "vitest";
import { Repository } from "../db/repository.js";
import { RoundEngine } from "./roundEngine.js";
import type { Player } from "../config.js";

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
  return { repo, engine, id };
}

function submit(engine: RoundEngine, playerId: number, score: number) {
  return engine.recordScore({ playerId, score, source: "text", rawRef: null });
}

describe("RoundEngine", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it("waits until all roster players submit", () => {
    const { engine, id } = ctx;
    const o1 = submit(engine, id("Alice"), 100);
    expect(o1.type).toBe("recorded");
    const o2 = submit(engine, id("Bob"), 90);
    expect(o2.type).toBe("recorded");
    if (o2.type === "recorded") {
      expect(o2.waitingOn.map((p) => p.display_name)).toEqual(["Charlie"]);
    }
  });

  it("resolves with the highest score and awards one point", () => {
    const { engine, repo, id } = ctx;
    submit(engine, id("Alice"), 100);
    submit(engine, id("Bob"), 90);
    const final = submit(engine, id("Charlie"), 80);
    expect(final.type).toBe("resolved");
    if (final.type === "resolved") {
      expect(final.winner.display_name).toBe("Alice");
      expect(final.winningScore).toBe(100);
    }
    const tally = repo.getTally();
    expect(tally.find((t) => t.displayName === "Alice")!.points).toBe(1);
    expect(tally.find((t) => t.displayName === "Bob")!.points).toBe(0);
  });

  it("keeps the first submission and ignores a re-submission at the same level", () => {
    const { engine, id } = ctx;
    submit(engine, id("Alice"), 50); // Alice's first (counts)
    submit(engine, id("Bob"), 90);
    const ignored = submit(engine, id("Alice"), 200); // later image is ignored
    expect(ignored.type).toBe("ignored");
    if (ignored.type === "ignored") expect(ignored.reason).toBe("already-submitted");
    const final = submit(engine, id("Charlie"), 80);
    expect(final.type).toBe("resolved");
    if (final.type === "resolved") {
      // Bob (90) wins; Alice's ignored 200 didn't count (she keeps her 50).
      expect(final.winner.display_name).toBe("Bob");
      expect(final.winningScore).toBe(90);
    }
  });

  it("starts a playoff on a tie and resolves it among the tied players", () => {
    const { engine, repo, id } = ctx;
    submit(engine, id("Alice"), 100);
    submit(engine, id("Bob"), 100);
    const tieOutcome = submit(engine, id("Charlie"), 80);
    expect(tieOutcome.type).toBe("playoff");
    if (tieOutcome.type === "playoff") {
      expect(tieOutcome.level).toBe(1);
      expect(tieOutcome.tiedPlayers.map((p) => p.display_name).sort()).toEqual([
        "Alice",
        "Bob",
      ]);
    }

    // Non-tied player's submission during the playoff is ignored.
    const ignored = submit(engine, id("Charlie"), 999);
    expect(ignored.type).toBe("ignored");

    // Tied players play again; Bob wins.
    submit(engine, id("Alice"), 30);
    const final = submit(engine, id("Bob"), 40);
    expect(final.type).toBe("resolved");
    if (final.type === "resolved") {
      expect(final.winner.display_name).toBe("Bob");
    }
    expect(repo.getTally().find((t) => t.displayName === "Bob")!.points).toBe(1);
  });

  it("handles a multi-level tie-break (tie again in the playoff)", () => {
    const { engine, repo, id } = ctx;
    // Level 0: Alice & Bob tie at 100.
    submit(engine, id("Alice"), 100);
    submit(engine, id("Bob"), 100);
    submit(engine, id("Charlie"), 50);

    // Level 1: they tie again.
    submit(engine, id("Alice"), 70);
    const secondTie = submit(engine, id("Bob"), 70);
    expect(secondTie.type).toBe("playoff");
    if (secondTie.type === "playoff") {
      expect(secondTie.level).toBe(2);
    }

    // Level 2: Alice edges it.
    submit(engine, id("Alice"), 88);
    const final = submit(engine, id("Bob"), 87);
    expect(final.type).toBe("resolved");
    if (final.type === "resolved") {
      expect(final.winner.display_name).toBe("Alice");
    }
    expect(repo.getTally().find((t) => t.displayName === "Alice")!.points).toBe(1);
  });

  it("opens a fresh round after one resolves and accumulates the tally", () => {
    const { engine, repo, id } = ctx;
    // Day 1: Alice wins.
    submit(engine, id("Alice"), 100);
    submit(engine, id("Bob"), 90);
    submit(engine, id("Charlie"), 80);
    // Day 2: Bob wins.
    submit(engine, id("Alice"), 10);
    submit(engine, id("Bob"), 90);
    const final = submit(engine, id("Charlie"), 80);
    expect(final.type).toBe("resolved");
    const tally = repo.getTally();
    expect(tally.find((t) => t.displayName === "Alice")!.points).toBe(1);
    expect(tally.find((t) => t.displayName === "Bob")!.points).toBe(1);
  });
});
