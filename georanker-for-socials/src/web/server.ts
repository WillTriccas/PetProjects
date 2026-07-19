/**
 * ── WEB ─────────────────────────────────────────────────────────────────────
 * The single hosted Node service. It serves:
 *   - the read-only themed dashboard (static files from `public/`)
 *   - `GET  /api/dashboard`      → the analytics JSON payload
 *   - `GET  /healthz`            → liveness probe (also wakes a sleeping Free tier)
 *   - `POST /telegram/webhook`   → live Telegram updates (when configured)
 *   - `POST /api/upload-export`  → authenticated WhatsApp export upload (optional)
 *
 * Designed for the cheapest Azure App Service (Free F1) today, but structured so
 * it upgrades to always-on / containers with no code changes.
 */

import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import AdmZip from "adm-zip";
import type { AppConfig } from "../config.js";
import { normaliseName, rosterKeyFor } from "../config.js";
import { logger } from "../logger.js";
import type { Repository } from "../db/repository.js";
import { StatsService } from "../analytics/statsService.js";
import { formatTally } from "../announcer/format.js";
import type { GroupMessenger } from "../announcer/announcer.js";
import { buildDashboardData } from "./api.js";
import { resolveExportPaths, runExport } from "../tools/exportRunner.js";
import type { TelegramClient } from "../telegram/telegramClient.js";

/** Collects announcements in-memory so an upload can echo them back to the user. */
class CapturingMessenger implements GroupMessenger {
  readonly messages: string[] = [];
  async sendToGroup(text: string): Promise<void> {
    this.messages.push(text);
  }
}

export interface WebServerDeps {
  config: AppConfig;
  repo: Repository;
  /** Live Telegram client to expose as a webhook, if hosting the bot. */
  telegram?: TelegramClient;
}

/** The absolute path to the static front-end, resolved from this module. */
const PUBLIC_DIR = fileURLToPath(new URL("../../public", import.meta.url));

export function createApp(deps: WebServerDeps): Express {
  const { config, repo, telegram } = deps;
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json());

  // ── Liveness ────────────────────────────────────────────────────────────
  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, uptime: process.uptime() });
  });

  // ── Dashboard data ──────────────────────────────────────────────────────
  app.get("/api/dashboard", (_req, res) => {
    try {
      res.json(buildDashboardData(repo, config.env.TIMEZONE));
    } catch (err) {
      logger.error({ err }, "Failed to build dashboard data");
      res.status(500).json({ error: "Failed to build dashboard data" });
    }
  });

  // ── Telegram webhook (only when a live client is wired) ─────────────────
  if (telegram) {
    app.post("/telegram/webhook", telegram.webhookMiddleware(config.env.TELEGRAM_WEBHOOK_SECRET));
    logger.info("Telegram webhook route mounted at POST /telegram/webhook");
  }

  // ── Authenticated WhatsApp export upload ────────────────────────────────
  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, mkdtempSync(join(tmpdir(), "georanker-upload-"))),
      filename: (_req, file, cb) => cb(null, file.originalname),
    }),
    limits: { fileSize: 200 * 1024 * 1024, files: 2000 },
  });

  const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
    const token = config.env.ADMIN_TOKEN;
    if (!token) {
      res.status(503).json({ error: "Uploads are disabled (set ADMIN_TOKEN to enable)." });
      return;
    }
    const provided = req.get("x-admin-token") ?? "";
    if (provided !== token) {
      res.status(401).json({ error: "Invalid or missing x-admin-token." });
      return;
    }
    next();
  };

  app.post("/api/upload-export", requireAdmin, upload.array("files"), async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      res.status(400).json({
        error: "No file uploaded. Drop your WhatsApp .zip export (or the _chat.txt plus images).",
      });
      return;
    }
    const uploadDir = files[0]!.destination;
    try {
      // If a WhatsApp .zip was uploaded, unzip it in place so we can process the
      // _chat.txt + media it contains — no manual extraction needed.
      for (const file of files) {
        if (file.originalname.toLowerCase().endsWith(".zip")) {
          new AdmZip(file.path).extractAllTo(uploadDir, /* overwrite */ true);
        }
      }

      const hasTxt = readdirSync(uploadDir).some((f) => f.toLowerCase().endsWith(".txt"));
      if (!hasTxt) {
        res.status(400).json({
          error: "No _chat.txt found. Upload the WhatsApp 'Export chat' .zip (or its contents).",
        });
        return;
      }
      const { txtPath, mediaDir } = resolveExportPaths(uploadDir);
      const messenger = new CapturingMessenger();
      const result = await runExport({ config, repo, txtPath, mediaDir, messenger });
      const stats = new StatsService(repo);
      res.json({
        ok: true,
        summary: result,
        announcements: messenger.messages,
        standings: formatTally(repo.getTally()),
        digest: stats.buildDigest(),
      });
    } catch (err) {
      logger.error({ err }, "Export upload failed");
      res.status(500).json({ error: (err as Error).message });
    } finally {
      rmSync(uploadDir, { recursive: true, force: true });
    }
  });

  // ── Admin: manually override a day's result (fix vision misreads) ────────
  // POST /api/admin/override-days  { days: [{ date, winner, score? }] }
  // winner is a roster display name or alias; null / "none" clears the winner.
  app.post("/api/admin/override-days", requireAdmin, (req, res) => {
    const body = req.body as {
      days?: Array<{ date?: string; winner?: string | null; score?: number | null }>;
    };
    const days = body?.days;
    if (!Array.isArray(days) || days.length === 0) {
      res.status(400).json({ error: "Provide { days: [{ date, winner, score? }] }." });
      return;
    }
    const applied: Array<{ date: string; winner: string | null; score: number | null }> = [];
    const errors: Array<{ date: string; error: string }> = [];
    for (const d of days) {
      if (!d.date) {
        errors.push({ date: String(d.date), error: "missing date" });
        continue;
      }
      let winnerPlayerId: number | null = null;
      let winnerName: string | null = null;
      const raw = (d.winner ?? "").trim();
      if (raw && raw.toLowerCase() !== "none" && raw.toLowerCase() !== "null") {
        const rosterPlayer = config.playersByName.get(normaliseName(raw));
        if (!rosterPlayer) {
          errors.push({ date: d.date, error: `unknown player "${raw}"` });
          continue;
        }
        const dbPlayer = repo.getPlayerByRosterKey(rosterKeyFor(rosterPlayer));
        if (!dbPlayer) {
          errors.push({ date: d.date, error: `player not in DB "${raw}"` });
          continue;
        }
        winnerPlayerId = dbPlayer.id;
        winnerName = dbPlayer.display_name;
      }
      try {
        repo.overrideDayResult({
          gameDate: d.date,
          winnerPlayerId,
          winningScore: d.score ?? null,
        });
        applied.push({ date: d.date, winner: winnerName, score: d.score ?? null });
      } catch (err) {
        errors.push({ date: d.date, error: (err as Error).message });
      }
    }
    // Recompute the hall of records from the corrected history.
    new StatsService(repo).recomputeRecords();
    res.json({
      ok: errors.length === 0,
      applied,
      errors,
      standings: formatTally(repo.getTally()),
    });
  });

  // ── Admin: wipe all derived score data (keep roster) for a clean re-extract ─
  // POST /api/admin/reset-scores  { confirm: "RESET" }
  app.post("/api/admin/reset-scores", requireAdmin, (req, res) => {
    const body = req.body as { confirm?: string };
    if (body?.confirm !== "RESET") {
      res.status(400).json({ error: 'Send { "confirm": "RESET" } to wipe all scores.' });
      return;
    }
    repo.resetScoreData();
    res.json({ ok: true, message: "All score data cleared. Re-upload the export to rebuild." });
  });

  // ── Static dashboard (served last so /api/* wins) ───────────────────────
  app.use(express.static(PUBLIC_DIR, { extensions: ["html"] }));
  return app;
}
