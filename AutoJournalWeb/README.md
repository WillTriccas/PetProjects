# Auto Journal — Web

A cross-platform web version of Auto Journal. Same idea as the iOS app — turn a
day's **photos**, **activity/biomarkers**, **places**, and **conversations** into a
short, grounded, first-person diary entry (2–3 paragraphs, ≤350 words) — but it
runs anywhere (Windows/macOS/Linux) **and** it can actually ingest the things iOS
sandboxes off: **WhatsApp, Messenger, and call history**.

Narratives are written by **GPT‑5.5** via **GitHub Models**, using your GitHub
license allowance. Your token stays on the server; everything else lives in a
local SQLite database.

---

## What it does

```
Photos (EXIF time + GPS) ┐
WhatsApp export (.txt)    │
Messenger DYI (.json)     ├─► local SQLite ─► per-day signals + hero images ─► GPT‑5.5 ─► 350-word entry ─► timeline
Call log (.csv)           │                    (reverse-geocoded places,
WHOOP API (strain/sleep)  ┘                     summarised chats & calls)
```

- **Grounded in your camera roll.** Hero photos are sent as images to the model, so
  the entry describes what actually happened, not invented details.
- **Where you went** is reverse-geocoded from photo GPS (via OpenStreetMap Nominatim).
- **Who you spoke to** comes from imported WhatsApp/Messenger threads and call logs.
- **How your body moved** comes from WHOOP (strain, heart rate, calories, sleep, workouts).
- One entry per day, browsable as a timeline. Add an optional manual note the data can't know.

---

## Setup

Requires **Node.js 20+**. `better-sqlite3` compiles a native module, so on Windows
you'll want the build tools (usually already present with a standard Node install;
if not, install the "Desktop development with C++" workload or run
`npm install --global windows-build-tools`).

```bash
cd AutoJournalWeb
npm install
cp .env.example .env      # then edit .env
npm start
```

Open <http://localhost:3000>.

### `.env`

| Variable | Purpose |
| --- | --- |
| `GITHUB_TOKEN` | **Required.** Fine-grained PAT with the **Models** permission. Never sent to the browser. |
| `MODEL` | Model slug. Default `openai/gpt-5.5`. Falls back to `openai/gpt-4o`. |
| `PORT` | Web server port (default 3000). |
| `MAX_PHOTOS_PER_DAY` | Hero images sent to the model per day (default 6). |
| `NOMINATIM_USER_AGENT` | Descriptive UA string for reverse geocoding (Nominatim policy). |
| `WHOOP_ACCESS_TOKEN` | Optional. WHOOP OAuth token for activity import (can also be set in the UI). |

**Getting a GitHub token:** GitHub → Settings → Developer settings →
Fine-grained tokens → generate one with **Models: Read** access, paste into `.env`.

---

## Importing your data

Everything is imported through the **Import** tab.

### Photos & videos
Drag in a day's worth of files. Time and GPS are read from EXIF automatically;
files without a timestamp use the "fallback day" you pick.

### WhatsApp
In WhatsApp open a chat → **⋯ / contact name → Export chat → Without media**, then
upload the resulting `.txt`. Both iOS (`[12/07/2026, 15:42:07] Alex: …`) and
Android (`12/07/2026, 15:42 - Alex: …`) formats are handled, including multi-line
messages. Dates are read day-first (DD/MM).

### Messenger
Facebook → **Settings & privacy → Download your information** → select **Messages**,
format **JSON**. Unzip and upload a thread's `message_1.json`. (Facebook's export
mojibake is repaired automatically.)

### Call history
iOS doesn't export call logs directly; on Android use any "call log backup / export
to CSV" app. Upload the CSV — columns are matched heuristically (date/time,
contact/number, type/direction, duration).

### WHOOP
Paste a WHOOP OAuth access token in **Settings**, then use **Fetch WHOOP day** for a
date. It pulls the day's cycle (strain, average HR, calories), sleep, and workouts
from the WHOOP Developer API v1.

---

## Generating an entry

Go to **Create**, pick a day, optionally add a note, and hit **Generate my day**.
The server gathers that day's signals, reverse-geocodes the places, samples hero
photos across the day, and asks GPT‑5.5 to write a grounded ≤350-word entry. It's
saved to the timeline; regenerating overwrites it.

---

## The model & the prompt

GPT‑5.5 is a **reasoning** model, so the client omits `temperature` and uses
`max_completion_tokens` (budgeting for reasoning + answer). The system prompt
(`server/prompt.js`) instructs the model to:

- ground everything in the supplied photos and signals and never invent people,
  places, events, or feelings;
- write first-person, past tense, reflective but natural;
- produce 2–3 short paragraphs, hard cap 350 words;
- weave in where you went, what you did, who you spoke to, and how your body moved,
  without just listing stats;
- keep it brief and honest when evidence is thin.

Each request also sends a structured day summary (date, ordered places, activity
line, per-contact message counts, calls, a photo manifest, and your manual note)
alongside the hero images.

---

## Privacy

- Your GitHub token lives only in the server `.env`; the browser never sees it.
- Photos, messages, calls, and activity are stored in `data/journal.db` (SQLite) and
  uploaded files in `uploads/` — both are gitignored and stay on your machine.
- Only the hero photos and the day's structured summary leave your machine, sent to
  GitHub Models to write the entry.

---

## Project layout

```
AutoJournalWeb/
├── server/
│   ├── index.js            Express app + routes
│   ├── db.js               SQLite schema + queries (better-sqlite3)
│   ├── generator.js        day → signals → prompt → entry pipeline
│   ├── llm.js              GitHub Models client (reasoning-aware)
│   ├── prompt.js           system prompt + context builder + word-limit trim
│   ├── photos.js           EXIF parse + base64 data URIs
│   ├── geocode.js          Nominatim reverse geocode + place clustering
│   └── connectors/
│       ├── whatsapp.js     export .txt parser + message summariser
│       ├── messenger.js    Facebook DYI JSON parser
│       ├── calls.js        call-log CSV parser + summariser
│       └── whoop.js        WHOOP Developer API v1 client
└── public/                 single-page UI (timeline, create, import, settings)
```

## Relationship to the iOS app

`../AutoJournal` is the native SwiftUI app. It's the better daily-capture experience
(direct PhotoKit + HealthKit access) but **cannot** read WhatsApp/Messenger/calls
because iOS sandboxes them. This web app closes that gap and runs on any OS, at the
cost of manual data exports. Both share the same prompt design and model.
