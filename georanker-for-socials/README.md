# GeoRanker for socials

A tool for friend groups who play **GeoRankl** daily and share score screenshots
in a WhatsApp group. It reads everyone's score, works out the winner (with
tie-break playoffs), keeps a running points tally in a lightweight local
database, and gives you the winner + standings message to drop in the group — so
nobody has to manually tally scores in a notes app anymore.

## Ways to run it

| Mode | Risk to your WhatsApp | Automation | Best for |
| --- | --- | --- | --- |
| **Export mode** (default, recommended) | **None** | Semi-manual | Anyone who can't risk their number |
| **Telegram bot** (fully automated) | **None** | Fully automated | Groups happy to play in Telegram |
| **WhatsApp live bot** (advanced) | Small (bot account only) | Fully automated | A dedicated/throwaway number |

> **Your personal number is only ever at risk if _you_ link it to the WhatsApp
> live bot.** Export mode uses WhatsApp's official "Export chat" feature and the
> Telegram bot uses Telegram's official Bot API — both are **zero ban risk**.
> Start with export mode; move to the Telegram bot if you want full automation.

All three modes share one database, so your standings and history are continuous
no matter which you use (or mix).

---

## Export mode (recommended — zero risk)

WhatsApp lets any user export a chat to a `.txt` transcript (plus the image
files). This tool parses that export, scores every submission, and prints the
winner announcements and cumulative standings for you to paste into the group.
Because it only reads an export you made yourself, there is **no automation and
no ban risk whatsoever**.

### Setup

```bash
cd georanker-for-socials
npm install
cp .env.example .env                          # set GITHUB_TOKEN (for reading screenshots)
cp config/roster.example.json config/roster.json
```

Edit `config/roster.json` — one entry per player. In export mode you don't need
`whatsappJid`; you need the **name each person shows up as in the chat**, added
as `aliases` if it differs from their `displayName`:

```json
{
  "players": [
    { "displayName": "Alice", "aliases": ["Alice Smith", "Ali"] },
    { "displayName": "Bob", "aliases": ["Bobby"] },
    { "displayName": "Charlie" }
  ]
}
```

### Exporting the chat from WhatsApp

- **iPhone:** open the group → tap the group name → **Export Chat** → **Attach
  Media** (so screenshots are included) → save/share the resulting folder or zip.
- **Android:** open the group → **⋮ → More → Export chat → Include media** →
  save the zip.

Unzip it somewhere. You'll have a `.txt` transcript alongside the image files.

### Running it

```bash
npm run process-export -- "/path/to/exported chat folder"
# or point directly at the transcript:
npm run process-export -- "/path/to/_chat.txt"
```

It prints, per completed day, a ready-to-paste message like:

```
📣 ─── post this in the group ───
🏆 *GeoRanker for socials* — winner of the day!

👑 *Bob* takes it with *70*.

📊 *Standings*
🥇 Alice — 1
🥇 Bob — 1
🥉 Charlie — 0
────────────────────────────────
```

(The `*asterisks*` render as **bold** once pasted into WhatsApp.)

Notes:
- A day is only scored once **all** roster players submitted; incomplete days are
  skipped (no winner).
- Ties are resolved with a playoff — the tool reads the tied players' next scores
  from that same day.
- It's **idempotent and incremental**: re-running on the same (or a later, fuller)
  export never double-counts, so you can export weekly and just re-run.

---

## Telegram bot (fully automated — zero ban risk)

If your group is happy to post scores in **Telegram**, this is the best of both
worlds: fully automated *and* zero ban risk, because it uses Telegram's official
Bot API (no account linking, nothing against anyone's Terms of Service). The bot
watches the group, reads each photo/number, decides the winner, tracks the tally,
and posts the enriched announcement itself.

### Setup

1. **Create a bot:** message [@BotFather](https://t.me/BotFather) → `/newbot` →
   follow the prompts → copy the **bot token** into `TELEGRAM_BOT_TOKEN` in `.env`.
2. **Let it read messages:** in BotFather → `/setprivacy` → select your bot →
   **Disable** (so it can see all group messages), *or* make the bot a group admin.
3. **Add the bot to your group.**
4. **Find the chat id:** add [@RawDataBot](https://t.me/RawDataBot) to the group
   briefly (or check the bot logs) and copy the group's `chat.id` (a negative
   number like `-1001234567890`) into `TELEGRAM_CHAT_ID`. Remove RawDataBot after.
5. **Identify players:** in `config/roster.json`, give each player their
   `telegramUserId` (numeric, most reliable) and/or `telegramUsername` (without the
   `@`). RawDataBot also shows user ids.

### Run

```bash
npm run telegram
```

The bot long-polls Telegram, so no public server or webhook is needed — just keep
it running (e.g. on a always-on machine, a Raspberry Pi, or a cheap VPS).

---

## WhatsApp live bot mode (advanced — dedicated number only)

Fully automates the flow inside the real WhatsApp group using
[Baileys](https://github.com/WhiskeySockets/Baileys) (a QR-linked account, like
WhatsApp Web). It reads submissions and posts results itself, with no manual
steps — but linking an account is against WhatsApp's Terms of Service and carries
a **small ban risk for that account**.

> ⚠️ **Never link your personal number.** Use a dedicated/throwaway number
> (a cheap PAYG SIM or eSIM — WhatsApp trusts these far more than VoIP numbers).
> A ban only ever affects the linked account, never you personally or your
> friends.

### Setup & run

```bash
# In .env, set GROUP_JID and GITHUB_TOKEN, and fill in whatsappJid for each player.
npm run list-groups     # scan the QR, then copy your group's JID into GROUP_JID
npm run dev             # or: npm run build && npm start
```

The first run prints a QR code — on the bot's phone, open **WhatsApp → Settings →
Linked devices → Link a device** and scan it. The session is saved in
`auth_state/` so you only link once. For live mode each player needs their
`whatsappJid` in `config/roster.json` (the value shown by `list-groups`/logs,
e.g. `447700900123@s.whatsapp.net`).

---

## Fun analytics & records

Every run records each submission's score **and its real chat time**, so the app
builds up long-term stats. Two things surface automatically:

**Daily callouts** — appended to each winner announcement:
- 🥄 **Wooden spoon** — the day's lowest score.
- ⏱️ **Fastest finger** / 🌙 **Last to post** — earliest and latest submitters.
- 🚀 **NEW RECORD** lines whenever the day beats an all-time record.
- 🕰️ **Nostalgia** — see below.

**All-time records** ("hall of records"), tracked and called out when broken:
highest score ever, lowest score ever, earliest & latest submission time ever,
and biggest winning margin ever.

**🕰️ Nostalgia notes** — flashbacks appended to the daily winner message:
- **On this day** — surfaces automatically whenever the same calendar date has a
  real anniversary in your history (e.g. "A year ago today, Alice won the day").
- **This time last month** — a memory from ~a month ago (who was crowned, top
  score). It's deliberately surfaced on a **randomised ~46-day cadence** (a fresh
  random interval each time), so there's no rhyme or reason to when it pops up.

**Weekly digest** — a fun summary you can post whenever you like:

```bash
npm run digest
```

It also prints at the end of every `process-export` run, and covers: 👑 **Point
Hoarder** (whoever holds the most cumulative points of all time) with the full
standings table beneath, win streaks (current & longest), last-7-days form,
per-player average/best/worst score, wooden-spoon counts, 👑 **Player of the
Month** (winning-most player each month), 🥈 **Bridesmaid** (most sole 2nd-place
finishes), 💪 **Group PB day** (highest ever combined score), the fastest-finger
league (early bird vs night owl), longest win drought, and the hall of records.

### More analytics ideas (easy to add — tell me which you want)

Comeback king (won the day after finishing last) · consistency award (Mr Reliable
vs Wildcard, by score variance) · clutch rating (playoff win %) · milestone alerts
(your Nth point/win) · perfect week · bogey weekday (the day you play worst) ·
Elo-style rating · participation streak · nemesis heatmap (who beats you most).

---

## Requirements

- **Node.js 20+** (uses the built-in `node:sqlite`, so no native compilation).
- A **GitHub personal access token** with the `models` scope, to read scores from
  screenshots via [GitHub Models](https://github.com/marketplace/models). Set
  `EXTRACTOR=disabled` to skip images and score typed numbers only.

## Configuration (`.env`)

| Variable | Default | Description |
| --- | --- | --- |
| `GITHUB_TOKEN` | — | GitHub PAT with `models` scope (required unless `EXTRACTOR=disabled`). |
| `GROUP_JID` | — | Target group JID — **WhatsApp live bot only**. |
| `TELEGRAM_BOT_TOKEN` | — | BotFather token — **Telegram bot only**. |
| `TELEGRAM_CHAT_ID` | — | Target group chat id (e.g. `-1001234567890`) — **Telegram bot only**. |
| `GITHUB_MODELS_BASE_URL` | `https://models.github.ai/inference` | GitHub Models endpoint. |
| `VISION_MODEL` | `openai/gpt-4o` | Vision-capable model id. |
| `EXTRACTOR` | `github-models` | `github-models` or `disabled` (text-only). |
| `TIMEZONE` | `Europe/London` | IANA timezone used to bucket the game day. |
| `ROSTER_PATH` | `config/roster.json` | Path to the roster file. |
| `DB_PATH` | `data/georanker.sqlite` | SQLite database path. |
| `AUTH_STATE_DIR` | `auth_state` | Where the live bot's WhatsApp session is stored. |
| `LOG_LEVEL` | `info` | `trace` \| `debug` \| `info` \| `warn` \| `error`. |

## Submissions & scoring

- A submission is either **a screenshot** (read by the vision model) or **a text
  message with a number** (e.g. `9050` or `score: 9,050`).
- Highest score wins the day → **1 point**.
- Ties trigger a playoff among the tied players (highest of the next game wins,
  repeated until unique).
- A day/round only resolves once **all** roster players have submitted.

## Testing

```bash
npm test
```

Covers the round/playoff engine (including multi-level tie-breaks), score parsing
from text and model output, the WhatsApp export parser (incl. timestamps), the
analytics computations (streaks, averages, wooden spoons, fastest finger, Player
of the Month, bridesmaid, group PB, nostalgia, records),
and announcement formatting.

## Roster identity

`config/roster.json` has one entry per player. A player can carry identifiers for
any/all platforms and they all resolve to the same person, so standings stay
continuous across modes:

- `displayName` + `aliases` — names as they appear in a **WhatsApp export**.
- `whatsappJid` — for the **WhatsApp live bot**.
- `telegramUserId` (numeric, preferred) and/or `telegramUsername` — for the
  **Telegram bot**.

## Data & state

- All state lives in the SQLite file at `DB_PATH`, so the tally persists and the
  live bot fully recovers its current round after a restart.
- `data/`, `auth_state/`, `.env`, and `config/roster.json` are git-ignored —
  **never commit them** (they contain personal data and, for the live bot,
  session credentials).

## GitHub Models on Enterprise

GitHub Models availability depends on your organisation enabling it. If it's
blocked, set `EXTRACTOR=disabled` for text-only scoring, or point the extractor
at another OpenAI-compatible vision endpoint via `GITHUB_MODELS_BASE_URL`,
`VISION_MODEL`, and `GITHUB_TOKEN`.
