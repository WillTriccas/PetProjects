# Wine & Words 🍷📚

A private, shared-code companion app for a book club: schedule events, track
what you're reading, leave half-star reviews (with spoiler protection), see a
weather snapshot for gathering day, get in-app notifications, and celebrate
attendance streaks and membership anniversaries.

Built with Next.js 15 (App Router, TypeScript, strict mode), Tailwind CSS,
and Supabase (Postgres + Auth + Row Level Security + Storage).

---

## 1. Project overview

Wine & Words is a single-club (or small multi-club) MVP. Members join with a
shared access code handed out by the club organizer — there is no public
sign-up. Once in, members can:

- See upcoming events and their own notifications on a **Dashboard**.
- Browse **Events** (upcoming + history), RSVP, ask/answer questions in a
  threaded Q&A, and leave a 1–5 half-star **review** with an optional
  spoiler flag.
- Search **Open Library** and import books into the club's shared library.
- See a **weather snapshot** for each event's date/location (fetched from
  Open-Meteo, persisted so it doesn't refetch every page load).
- View the **Members** directory and individual profiles.
- See personal **achievements** (attendance streaks, review milestones),
  membership **anniversaries**, and the club's most popular meeting month.

All data is scoped to a `club_id` and protected by Postgres Row Level
Security — members can only ever see their own club's data.

## 2. Prerequisites

- **Node.js 20+** (Node 24 also works — verified during development)
- **npm** (bundled with Node) — pnpm/yarn work too if you prefer
- **Supabase CLI** through `npx supabase` (no global installation required)
- A free [Supabase](https://supabase.com) account for hosting (or the local
  CLI stack for development)
- **Docker Desktop** (only required if you run `supabase start` locally,
  since the Supabase CLI spins up Postgres/Auth/Storage in containers)

## 3. Supabase setup

The simplest setup is a free hosted Supabase project with the Next.js app
running locally. This avoids requiring Docker.

1. Create a project at [database.new](https://database.new) and wait for it to
   finish provisioning.
2. In Supabase, copy the **Project URL**, **publishable/anon key**, and
   **service role key** from **Project Settings → API**. Never expose or commit
   the service role key.
3. From `wine-and-words`, initialize and link the CLI, then apply every checked-in
   migration:

   ```powershell
   npx supabase init
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```

   The project ref is the first subdomain segment in
   `https://<project-ref>.supabase.co`.
4. In **Authentication → URL Configuration**, set **Site URL** to
   `http://localhost:3000` and add
   `http://localhost:3000/auth/callback` to **Redirect URLs**.
5. In **SQL Editor**, bootstrap the club using the SQL in
   [Shared access code bootstrap](#4-shared-access-code-bootstrap).

Migration `004_avatar_storage.sql` creates the public `avatars` bucket and
restricts uploads, updates, and deletions to each authenticated user's own
folder.

### Fully local Supabase alternative

From the `wine-and-words/` directory:

```powershell
# Create supabase/config.toml the first time
npx supabase init

# Start Postgres, Auth, Storage, and Studio in Docker
npx supabase start

# Recreate the database and apply all migrations
npx supabase db reset
```

`supabase db reset` drops and recreates the local database and replays every
file in `supabase/migrations/` in filename order, so schema, RLS policies,
and functions all end up applied together.

`npx supabase start` prints a local `API URL`, `anon key`, and `service_role
key` — copy these into your `.env.local` (see [Environment variables](#8-environment-variables-reference)).

## 4. Shared access code bootstrap

Wine & Words has no public registration — every club is gated behind a
shared access code that the organizer hashes and stores once, then shares
out-of-band (text message, email, printed card, etc.).

Connect to your database through the Supabase Studio SQL editor and run:

```sql
-- Make sure pgcrypto is available (already enabled by 001_schema.sql)
create extension if not exists pgcrypto;

-- Create a club with a bcrypt-hashed access code.
insert into clubs (name, access_code_hash)
values (
  'The Wine & Words Book Club',
  crypt('choose-a-memorable-passphrase', gen_salt('bf'))
);
```

`crypt(..., gen_salt('bf'))` hashes the plaintext code with bcrypt
(Blowfish) — the plaintext is never stored. Share
`choose-a-memorable-passphrase` with your members; they'll enter it once on
the `/auth/join` page, which calls the `join_club(p_access_code,
p_display_name, p_club_id)` Postgres function. That function re-hashes the
submitted code with `crypt()` and compares it against `access_code_hash`,
raising `invalid_access_code` on a mismatch — the comparison always happens
server-side, inside Postgres, so the hash is never exposed to the client.

The join page also calls the `list_public_clubs()` RPC to let a new member
pick which club they're joining by name — it only ever returns `id` and
`name`, never the hash, and the underlying `clubs` table itself has zero
direct client-facing SELECT/INSERT/UPDATE/DELETE access (see
`002_rls.sql`).

## 5. Access code rotation procedure

If a code leaks or you simply want to rotate it periodically:

```sql
update clubs
set access_code_hash = crypt('a-new-passphrase', gen_salt('bf'))
where id = '<club-id>';
```

Existing members are unaffected (their `profiles` row already exists), so
rotation only impacts people who haven't joined yet. Distribute the new
code through your usual out-of-band channel.

## 6. Running locally

```powershell
Set-Location wine-and-words
npm install
Copy-Item .env.example .env.local
# Edit .env.local with the three Supabase values; keep NEXT_PUBLIC_APP_URL=http://localhost:3000
npm run dev
```

Then visit `http://localhost:3000`. You'll be redirected to `/auth/login`
until you sign in (magic link) and join a club at `/auth/join`.

Other useful scripts:

```bash
npm run build   # production build
npm run start   # run the production build
npm run lint    # ESLint (flat config, next/core-web-vitals + next/typescript)
npm test        # Vitest unit tests for the pure domain logic
```

## 7. Deploying to Vercel + Supabase free tier

1. **Create a Supabase project** at [supabase.com](https://supabase.com)
   (free tier). Note the project's URL, anon key, and service role key from
   Project Settings → API.
2. **Apply migrations** to the hosted project:
   ```powershell
   npx supabase init
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
   (`db push` applies any migrations in `supabase/migrations/` that haven't
   run yet, in order.)
3. **Bootstrap your club row** by running the `insert into clubs (...)`
   statement from [section 4](#4-shared-access-code-bootstrap) against the
   hosted database (Supabase Studio → SQL Editor).
4. **Configure Supabase Auth** → Authentication → URL Configuration: set the
   Site URL to your future Vercel domain (e.g.
   `https://wine-and-words.vercel.app`) and add
   `https://wine-and-words.vercel.app/auth/callback` as a redirect URL.
5. **Push this repo to GitHub**, then in [Vercel](https://vercel.com):
   - New Project → import the repo.
   - Set the **Root Directory** to `wine-and-words` (since this app lives in
     a subdirectory).
   - Framework preset: Next.js (auto-detected).
   - Add the environment variables from `.env.example` (see below) under
     Project Settings → Environment Variables, using your hosted Supabase
     values and your Vercel URL for `NEXT_PUBLIC_APP_URL`.
6. **Deploy.** Vercel builds and hosts the app on its free Hobby tier;
   Supabase's free tier covers the Postgres database, Auth, and Storage.
7. After the first deploy, double-check `NEXT_PUBLIC_APP_URL` matches the
   real deployed URL (magic links use it to build the callback redirect),
   then redeploy if you changed it.

## 8. Environment variables reference

Defined in `.env.example`:

| Variable | Where used | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Your Supabase project URL. Public by design. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | Public anon key; safe to expose — access is enforced by RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | **Never** imported into client code. Used only by `createServiceRoleClient()` (see `src/lib/supabase/server.ts`) to write rows that bypass RLS, such as weather snapshots fetched by the server. |
| `NEXT_PUBLIC_APP_URL` | server (magic link redirect) | Base URL used to build the `/auth/callback` redirect for Supabase magic-link emails. |

## 9. Backup / data portability

Because everything lives in your own Supabase Postgres database, you own
full portability:

```bash
# Full logical dump (schema + data), hosted project
supabase db dump --db-url "postgresql://postgres:<password>@<host>:5432/postgres" -f backup.sql

# Or, using plain pg_dump directly against the connection string from
# Project Settings → Database → Connection string:
pg_dump "postgresql://postgres:<password>@<host>:5432/postgres" -f backup.sql

# Restore into a fresh database:
psql "postgresql://postgres:<password>@<host>:5432/postgres" -f backup.sql
```

For a lighter export of just your own data (e.g. to hand a member their
reviews), use the Supabase Studio Table Editor's CSV export, or query and
export via `psql \copy`. Avatar images live in the `avatars` Storage bucket
and can be downloaded via the Supabase CLI (`supabase storage cp`) or the
Storage API.

## 10. APIs used

- **[Open Library Search API](https://openlibrary.org/dev/docs/api/search)**
  — used server-side (`src/lib/domain/openLibrary.ts`) to search for books
  by title/author and import cover art, page count, and publish year. No
  API key required.
- **[Open-Meteo](https://open-meteo.com/)** — used server-side
  (`src/lib/domain/weather.ts`) to fetch a historical/forecast weather
  snapshot for an event's date and coordinates. No API key required. All
  calls have an 8s timeout and never throw — a failure just means no
  weather badge is shown.

Both integrations are called only from server code (Server Actions / Server
Components) — never directly from the browser — to keep API usage
consistent and avoid CORS/rate-limit surprises.

## 11. Privacy & limitations

- **Shared-code registration.** There's no public sign-up; the `clubs` table
  is fully locked down from direct client access, and joining requires the
  shared access code verified server-side inside Postgres.
- **Club-scoped RLS everywhere.** Every table (profiles, books, events,
  attendance, questions, reviews, notifications) is scoped to `club_id` via
  Row Level Security, so one club's members can never see another club's
  data, even if multiple clubs share the same Supabase project.
- **Notifications are private.** Only the `recipient_id` can select or
  update their own notification rows.
- **Weather/Open Library data is best-effort.** Both integrations degrade
  gracefully — a network hiccup just means an event shows no weather badge,
  or a search returns no results, instead of failing the page.
- **This is an MVP.** There's no email/SMS notification delivery (only
  in-app), no real-time chat, no image moderation for avatars, and no admin
  UI for rotating access codes (it's a manual SQL step — see section 5).
- **Single Postgres schema type file.** `src/lib/supabase/types.ts` is
  hand-written to mirror the SQL migrations rather than generated by
  `supabase gen types typescript`, since this project ships without a live
  Supabase project pre-provisioned. Regenerate it against your own project
  once you have one running, if you'd like fully generated types.
