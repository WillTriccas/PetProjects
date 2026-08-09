import { describe, expect, it } from "vitest";
import { matchSenderToPlayer, normaliseName, type Player } from "./config.js";

/** Build a normalised alias -> player map like loadConfig does. */
function nameMap(players: Player[]): Map<string, Player> {
  const map = new Map<string, Player>();
  for (const p of players) {
    for (const alias of [p.displayName, ...(p.aliases ?? [])]) {
      map.set(normaliseName(alias), p);
    }
  }
  return map;
}

const adam: Player = { displayName: "Adam Hewitt", aliases: ["Adam Hewitt", "Adam"] };
const will: Player = { displayName: "Will Triccas", aliases: ["Will Triccas", "Will"] };
const matt: Player = { displayName: "Matthijs Windmeijer", aliases: ["Matthijs Windmeijer", "Matthijs"] };
const map = nameMap([adam, will, matt]);

describe("matchSenderToPlayer", () => {
  it("matches an exact alias", () => {
    expect(matchSenderToPlayer(map, "Adam Hewitt")).toBe(adam);
    expect(matchSenderToPlayer(map, "adam")).toBe(adam);
  });

  it("ignores emoji and punctuation saved in a contact name", () => {
    expect(matchSenderToPlayer(map, "Adam Hewitt 🌍")).toBe(adam);
    expect(matchSenderToPlayer(map, "Will (uni) 🎓")).toBe(will);
  });

  it("matches on a unique first name when the surname differs", () => {
    expect(matchSenderToPlayer(map, "Adam H")).toBe(adam);
    expect(matchSenderToPlayer(map, "Matthijs W")).toBe(matt);
  });

  it("returns null for an unknown sender", () => {
    expect(matchSenderToPlayer(map, "Random Person")).toBeNull();
    expect(matchSenderToPlayer(map, "")).toBeNull();
  });
});
