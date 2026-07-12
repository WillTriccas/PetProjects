# GeoRanker for socials

A WhatsApp bot for friend groups who play **GeoRankl** daily. It watches your
group chat, reads each person's score from their photo (or a typed number),
figures out the winner, keeps a running points tally in a lightweight local
database, and posts the result straight back into the group — no more manual
tallying in a notes app.

## How it works

```
WhatsApp group ──(Baileys)──▶ read submissions ──▶ score extractor (image | text)
                                                        │
                                                        ▼
                                                 round / playoff engine
                                                        │
                                     ┌──────────────────┼───────────────────┐
                                     ▼                  ▼                    ▼
                                 SQLite DB          announcer ──▶ post winner + tally
```

- Players keep submitting in the group exactly as they do today.
- When **every** player on the roster has submitted, the bot picks the **highest
  score** as the winner and awards **1 point**.
- On a tie, the tied players get a **playoff**: they play another game and the
  highest score wins. This repeats until someone comes out on top.
- The bot posts the winner plus the **cumulative standings** in the group.

## Requirements

- **Node.js 20+** (uses the built-in `node:sqlite`, so no native compilation).
- A **dedicated / secondary WhatsApp account** to run the bot from (recommended —
  see the caveat below). This account must be a member of the group.
- A **GitHub personal access token** with the `models` scope for score reading
  via [GitHub Models](https://github.com/marketplace/models) (or run text-only).

## Setup

```bash
cd georanker-for-socials
npm install
cp .env.example .env
cp config/roster.example.json config/roster.json
```

1. **Fill in `.env`** — at minimum `GROUP_JID` and `GITHUB_TOKEN`.
2. **Fill in `config/roster.json`** — one entry per player with their display
   name and their WhatsApp JID (e.g. `447700900123@s.whatsapp.net`).

### Linking the WhatsApp account

The first run prints a QR code in the terminal. On the phone for the bot's
account, open **WhatsApp → Settings → Linked devices → Link a device** and scan
it. The session is saved in `auth_state/` so you only do this once.

### Finding your group JID

Run the helper (it links the account the same way and prints a table of every
group you're in):

```bash
npm run list-groups
```

Copy the `jid` of your group (it ends in `@g.us`) into `GROUP_JID` in `.env`.

## Running

```bash
npm run dev     # watch mode for development
# or
npm run build && npm start
```

## Configuration (`.env`)

| Variable | Default | Description |
| --- | --- | --- |
| `GROUP_JID` | — | The target group, e.g. `123-160...@g.us` (required). |
| `GITHUB_TOKEN` | — | GitHub PAT with `models` scope (required unless `EXTRACTOR=disabled`). |
| `GITHUB_MODELS_BASE_URL` | `https://models.github.ai/inference` | GitHub Models endpoint. |
| `VISION_MODEL` | `openai/gpt-4o` | Vision-capable model id. |
| `EXTRACTOR` | `github-models` | `github-models` or `disabled` (text-only). |
| `TIMEZONE` | `Europe/London` | IANA timezone used to bucket the game day. |
| `ROSTER_PATH` | `config/roster.json` | Path to the roster file. |
| `DB_PATH` | `data/georanker.sqlite` | SQLite database path. |
| `AUTH_STATE_DIR` | `auth_state` | Where the WhatsApp session is stored. |
| `LOG_LEVEL` | `info` | `trace` \| `debug` \| `info` \| `warn` \| `error`. |

## Submissions

A player's daily submission can be either:

- **A screenshot** of their GeoRankl result (read by the vision model), or
- **A text message** containing their number (e.g. `9050` or `score: 9,050`).

If the bot can't read a score it politely asks that player to resend. Any
re-submission before the round resolves overwrites the previous one.

## Scoring rules

- Highest score wins the day → **1 point**.
- Ties trigger a playoff among the tied players (highest of the next game wins,
  repeated until unique).
- A round only resolves once **all** roster players have submitted.

## Testing

```bash
npm test
```

Covers the round/playoff engine (including multi-level tie-breaks), score
parsing from text and model output, and announcement formatting.

## Data & state

- All state lives in the SQLite file at `DB_PATH`, so the bot fully recovers its
  current round and tally after a restart.
- The WhatsApp session lives in `AUTH_STATE_DIR`.
- `data/`, `auth_state/`, `.env`, and `config/roster.json` are git-ignored —
  **never commit them** (they contain session credentials and personal data).

## GitHub Models on Enterprise

GitHub Models availability depends on your organisation enabling it. If it's
blocked, set `EXTRACTOR=disabled` to run in text-only mode, or point the
extractor at another OpenAI-compatible vision endpoint by swapping
`GITHUB_MODELS_BASE_URL`, `VISION_MODEL`, and `GITHUB_TOKEN`.

## Caveat: unofficial WhatsApp integration

This uses [Baileys](https://github.com/WhiskeySockets/Baileys), which links a
real WhatsApp account (like WhatsApp Web). It's unofficial and against WhatsApp's
Terms of Service for automation, so there's a small risk the number could be
limited or banned. **Use a dedicated/secondary number**, not your personal one.
