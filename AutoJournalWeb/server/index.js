import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { mkdirSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import * as store from './db.js';
import { photoRowFromUpload } from './photos.js';
import { parseWhatsApp } from './connectors/whatsapp.js';
import { parseMessenger } from './connectors/messenger.js';
import { parseCalls } from './connectors/calls.js';
import { fetchWhoopDay } from './connectors/whoop.js';
import { generateEntry } from './generator.js';
import { today } from './util.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadsDir = join(__dirname, '..', 'uploads');
mkdirSync(uploadsDir, { recursive: true });

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(join(__dirname, '..', 'public')));

// Photos are kept on disk; text/JSON/CSV imports are read from memory.
const diskUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});
const memUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

// ---- Config resolution (token stays server-side) ----

function config() {
  return {
    token: process.env.GITHUB_TOKEN || '',
    model: store.getSetting('model', process.env.MODEL || 'openai/gpt-5.5'),
    maxPhotos: parseInt(store.getSetting('maxPhotos', process.env.MAX_PHOTOS_PER_DAY || '6'), 10),
    whoopToken: store.getSetting('whoopToken', process.env.WHOOP_ACCESS_TOKEN || ''),
  };
}

const wrap = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

// ---- Entries ----

app.get('/api/entries', (_req, res) => res.json(store.listEntries()));

app.get('/api/entries/:day', (req, res) => {
  const entry = store.getEntry(req.params.day);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  res.json(entry);
});

app.delete('/api/entries/:day', (req, res) => {
  store.deleteEntry(req.params.day);
  res.json({ ok: true });
});

app.post('/api/generate', wrap(async (req, res) => {
  const { day, manualNote } = req.body;
  if (!day) return res.status(400).json({ error: 'day is required' });
  const cfg = config();
  if (!cfg.token) return res.status(400).json({ error: 'No GITHUB_TOKEN configured on the server.' });
  const entry = await generateEntry({
    day, manualNote: manualNote || '', token: cfg.token, model: cfg.model,
    maxPhotos: cfg.maxPhotos, uploadsDir,
  });
  store.upsertEntry(entry);
  res.json(store.getEntry(day));
}));

// ---- Photo serving ----

app.get('/api/photo/:id', (req, res) => {
  const photo = store.getPhoto(req.params.id);
  if (!photo) return res.status(404).end();
  res.sendFile(join(uploadsDir, photo.filename));
});

// ---- Imports ----

app.post('/api/import/photos', diskUpload.array('files'), wrap(async (req, res) => {
  const fallbackDay = req.body.day || null;
  const rows = [];
  for (const file of req.files || []) {
    const row = await photoRowFromUpload(file, fallbackDay);
    store.insertPhoto(row);
    rows.push(row);
  }
  res.json({ imported: rows.length, days: [...new Set(rows.map((r) => r.day))] });
}));

app.post('/api/import/whatsapp', memUpload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const rows = parseWhatsApp(req.file.buffer.toString('utf8'));
  if (rows.length) store.insertMessages(rows);
  res.json({ imported: rows.length, days: [...new Set(rows.map((r) => r.day))] });
}));

app.post('/api/import/messenger', memUpload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  let json;
  try { json = JSON.parse(req.file.buffer.toString('utf8')); }
  catch { return res.status(400).json({ error: 'Not valid JSON (expected message_1.json).' }); }
  const rows = parseMessenger(json);
  if (rows.length) store.insertMessages(rows);
  res.json({ imported: rows.length, days: [...new Set(rows.map((r) => r.day))] });
}));

app.post('/api/import/calls', memUpload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const rows = parseCalls(req.file.buffer.toString('utf8'));
  if (rows.length) store.insertCalls(rows);
  res.json({ imported: rows.length, days: [...new Set(rows.map((r) => r.day))] });
}));

app.post('/api/import/whoop', wrap(async (req, res) => {
  const day = req.body.day || today();
  const cfg = config();
  if (!cfg.whoopToken) return res.status(400).json({ error: 'No WHOOP access token configured.' });
  const summary = await fetchWhoopDay(day, cfg.whoopToken);
  store.upsertHealth(day, 'whoop', summary);
  res.json({ day, summary });
}));

// ---- Settings ----

app.get('/api/settings', (_req, res) => {
  const cfg = config();
  res.json({
    model: cfg.model,
    maxPhotos: cfg.maxPhotos,
    hasToken: !!cfg.token,
    hasWhoop: !!cfg.whoopToken,
    daysWithData: store.daysWithData(),
    today: today(),
  });
});

app.post('/api/settings', (req, res) => {
  const { model, maxPhotos, whoopToken } = req.body;
  if (model) store.setSetting('model', model);
  if (maxPhotos) store.setSetting('maxPhotos', maxPhotos);
  if (whoopToken !== undefined) store.setSetting('whoopToken', whoopToken);
  res.json({ ok: true });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Auto Journal Web running at http://localhost:${port}`);
  if (!process.env.GITHUB_TOKEN) {
    console.warn('⚠  GITHUB_TOKEN is not set — generation will fail until you add it to .env');
  }
});
