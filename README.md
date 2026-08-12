# PetProjects

A collection of small, practical applications built to turn personal ideas into
working software. Each project is independent and keeps its own setup,
configuration, and detailed documentation.

## Project catalogue

| Project | What it does | Stack | Status | Hosting |
| --- | --- | --- | --- | --- |
| [Wine & Words](./wine-and-words/) | A private book-club hub for planning gatherings, rating books, tracking attendance, browsing member profiles, and resurfacing shared memories. | Next.js, TypeScript, Tailwind CSS, Supabase/PostgreSQL | MVP implemented; deployment pending | Designed for Vercel and Supabase; not yet documented as live |
| [GeoRanker for socials](./georanker-for-socials/) | Reads GeoRankl score screenshots from social groups, resolves daily winners, tracks standings, and publishes a shared analytics dashboard. | Node.js, TypeScript, SQLite, Express, Telegram/WhatsApp integrations | Live | [Azure App Service dashboard](https://georanker-will.azurewebsites.net), deployed from `main` by GitHub Actions |
| [Auto Journal](./AutoJournal/) | Creates short daily journal entries from iPhone photos, locations, Apple Health data, and optional notes. | SwiftUI, SwiftData, PhotoKit, HealthKit, GitHub Models | Local prototype | Runs on a physical iPhone through Xcode; no hosted distribution is documented |
| [Auto Journal Web](./AutoJournalWeb/) | Creates daily journal entries from uploaded photos, activity data, place history, chats, and calls on desktop platforms. | Node.js, Express, SQLite, GitHub Models | Local prototype | Runs locally at `localhost`; no hosted deployment is documented |

## Deployment status

- **Live** means the repository contains a verifiable public URL and an active
  deployment path.
- **In development** means the app and its target hosting approach are being
  built, but no live deployment is claimed.
- **Local prototype** means the app runs on a developer machine or device and
  has no documented hosted release.

Deployment details can change independently for each project. Follow the
project link in the catalogue for current setup instructions, environment
variables, and platform requirements.

## Repository layout

```text
PetProjects/
|-- wine-and-words/       Private book-club web application
|-- georanker-for-socials/ GeoRankl scoring and social dashboard
|-- AutoJournal/          Native iOS journal application
`-- AutoJournalWeb/       Cross-platform journal web application
```

## Getting started

There is no repository-wide install command because the projects use different
runtimes and dependency sets.

- The JavaScript and TypeScript projects require Node.js 20 or newer.
- Auto Journal requires macOS, Xcode 16 or newer, and a physical iPhone running
  iOS 17 or newer.
- Run install, development, build, and test commands from the selected
  project's directory using its README.

## Privacy and secrets

Several projects process personal photos, messages, health data, locations, or
private group activity. Never commit `.env` files, API tokens, authentication
state, private rosters, database files, exported conversations, uploads, or
precise personal addresses. Each project README explains where its local data
is stored and which information is sent to external services.

The projects are experimental and intended for personal use. Review the
security, privacy, service terms, and deployment configuration before sharing
an instance with other people.
