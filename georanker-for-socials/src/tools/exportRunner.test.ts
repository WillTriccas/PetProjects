import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppConfig, Player, Roster } from "../config.js";
import { Repository } from "../db/repository.js";
import type { GroupMessenger } from "../announcer/announcer.js";
import type { ImageScoreExtractor } from "../extractor/index.js";
import { runExport } from "./exportRunner.js";

/** Fake extractor: the image file's text content IS the score ("x" = unreadable). */
const fakeExtractor: ImageScoreExtractor = {
  name: "fake",
  async extractFromImage(buf) {
    const n = Number(buf.toString("utf8").trim());
    return Number.isFinite(n) ? n : null;
  },
};

class CapturingMessenger implements GroupMessenger {
  readonly messages: string[] = [];
  async sendToGroup(text: string) {
    this.messages.push(text);
  }
}

const ROSTER_PLAYERS: Player[] = [
  { displayName: "Alice" },
  { displayName: "Bob" },
  { displayName: "Charlie" },
];

function buildConfig(): AppConfig {
  const roster: Roster = { players: ROSTER_PLAYERS };
  const playersByName = new Map<string, Player>(
    ROSTER_PLAYERS.map((p) => [p.displayName.toLowerCase(), p]),
  );
  return {
    env: {} as AppConfig["env"],
    roster,
    playersByJid: new Map(),
    playersByName,
    playersByTelegramId: new Map(),
    playersByTelegramUsername: new Map(),
  };
}

/** A single "[dd/mm/yyyy, hh:mm:ss] Sender: <attached: file>" image line + its media file. */
interface Post {
  sender: string;
  file: string;
  score: string; // written as the file's content; "x" = unreadable
}

function writeExport(dir: string, days: Array<{ date: string; posts: Post[] }>): string {
  const lines: string[] = [];
  for (const { date, posts } of days) {
    posts.forEach((post, i) => {
      const hh = String(9 + Math.floor(i / 60)).padStart(2, "0");
      const mm = String(i % 60).padStart(2, "0");
      lines.push(`[${date}, ${hh}:${mm}:00] ${post.sender}: \u200e<attached: ${post.file}>`);
      writeFileSync(join(dir, post.file), post.score);
    });
  }
  const txtPath = join(dir, "_chat.txt");
  writeFileSync(txtPath, lines.join("\n"), "utf8");
  return txtPath;
}

describe("runExport (image-only, idempotent)", () => {
  let dir: string;
  let repo: Repository;
  let config: AppConfig;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "grfs-export-"));
    repo = new Repository(":memory:");
    config = buildConfig();
    repo.syncPlayers(ROSTER_PLAYERS);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function countImages(): number {
    return repo.getImageDays().reduce((n, d) => n + repo.getImagesForDay(d).length, 0);
  }

  it("scores days image-only, resolves playoffs, marks DQs, and awards points", async () => {
    const txtPath = writeExport(dir, [
      {
        // Day 1: Alice & Bob tie on 900; playoff on 2nd pic → Alice (40) beats Bob (12).
        date: "12/07/2026",
        posts: [
          { sender: "Alice", file: "a1.jpg", score: "900" },
          { sender: "Bob", file: "b1.jpg", score: "900" },
          { sender: "Charlie", file: "c1.jpg", score: "700" },
          { sender: "Alice", file: "a2.jpg", score: "40" },
          { sender: "Bob", file: "b2.jpg", score: "12" },
        ],
      },
      {
        // Day 2: Bob wins outright; Charlie posts no picture → DQ.
        date: "13/07/2026",
        posts: [
          { sender: "Alice", file: "a3.jpg", score: "800" },
          { sender: "Bob", file: "b3.jpg", score: "850" },
        ],
      },
    ]);

    const messenger = new CapturingMessenger();
    const result = await runExport({ config, repo, txtPath, mediaDir: dir, messenger, extractor: fakeExtractor });

    expect(result.newImages).toBe(7);
    expect(result.resolvedDays).toBe(2);
    expect(result.decidedRounds).toBe(2);
    expect(messenger.messages).toHaveLength(2);

    const tally = repo.getTally();
    const points = (name: string) => tally.find((t) => t.displayName === name)!.points;
    expect(points("Alice")).toBe(1); // day 1
    expect(points("Bob")).toBe(1); // day 2
    expect(points("Charlie")).toBe(0);

    // Charlie sat out day 2 → one DQ.
    const dqs = repo.getDisqualificationCounts();
    expect(dqs.find((d) => d.displayName === "Charlie")?.count).toBe(1);
  });

  it("is idempotent: re-running the same export adds and changes nothing", async () => {
    const days = [
      {
        date: "12/07/2026",
        posts: [
          { sender: "Alice", file: "a1.jpg", score: "900" },
          { sender: "Bob", file: "b1.jpg", score: "850" },
          { sender: "Charlie", file: "c1.jpg", score: "700" },
        ],
      },
    ];
    const txtPath = writeExport(dir, days);

    const first = await runExport({
      config, repo, txtPath, mediaDir: dir, messenger: new CapturingMessenger(), extractor: fakeExtractor,
    });
    expect(first.newImages).toBe(3);
    expect(first.decidedRounds).toBe(1);
    const imagesAfterFirst = countImages();
    const tallyAfterFirst = JSON.stringify(repo.getTally());

    const messenger2 = new CapturingMessenger();
    const second = await runExport({
      config, repo, txtPath, mediaDir: dir, messenger: messenger2, extractor: fakeExtractor,
    });
    expect(second.newImages).toBe(0);
    expect(second.resolvedDays).toBe(0);
    expect(second.decidedRounds).toBe(0);
    expect(messenger2.messages).toHaveLength(0);
    expect(countImages()).toBe(imagesAfterFirst);
    expect(JSON.stringify(repo.getTally())).toBe(tallyAfterFirst);
  });

  it("ingests only the new days when an overlapping export is re-uploaded", async () => {
    const day1 = {
      date: "12/07/2026",
      posts: [
        { sender: "Alice", file: "a1.jpg", score: "900" },
        { sender: "Bob", file: "b1.jpg", score: "850" },
      ],
    };
    const day2 = {
      date: "13/07/2026",
      posts: [
        { sender: "Alice", file: "a2.jpg", score: "700" },
        { sender: "Bob", file: "b2.jpg", score: "950" },
      ],
    };

    // First upload has day 1 only.
    const txt1 = writeExport(dir, [day1]);
    await runExport({ config, repo, txtPath: txt1, mediaDir: dir, messenger: new CapturingMessenger(), extractor: fakeExtractor });

    // Second upload is the FULL chat (day 1 + day 2) — only day 2 should be new.
    const txt2 = writeExport(dir, [day1, day2]);
    const messenger = new CapturingMessenger();
    const result = await runExport({ config, repo, txtPath: txt2, mediaDir: dir, messenger, extractor: fakeExtractor });

    expect(result.newImages).toBe(2); // only day 2's two pictures
    expect(result.decidedRounds).toBe(1); // only day 2 re-resolved
    expect(messenger.messages).toHaveLength(1);

    const tally = repo.getTally();
    const points = (name: string) => tally.find((t) => t.displayName === name)!.points;
    expect(points("Alice")).toBe(1); // day 1
    expect(points("Bob")).toBe(1); // day 2
  });
});
