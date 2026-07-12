# Auto Journal

A native iOS app that automatically writes a short, warm diary entry about the day you just had — grounded in your **camera roll**, enriched with your **activity/biometrics** (Apple Health, including WHOOP-synced data) and the **places you went** (derived from your photos' GPS). Each entry is a reflective 2–3 paragraphs, capped at **350 words**, saved one-per-day so you build an ongoing record of your life.

> The goal: you already take photos to remember days — this turns those moments into something you can *read* and appreciate, especially when life gets busy.

## How it works

```
Photos (PhotoKit)  ─┐
Activity (HealthKit)─┼─▶  DaySignals  ──▶  GitHub Models (gpt-4o, multimodal)  ──▶  JournalEntry
Places (photo GPS) ─┘         ▲                                                      (SwiftData, on device)
Manual notes ───────────────┘
```

1. **PhotoService** fetches the day's photos/videos with timestamps + GPS, and downsizes a representative handful to send to the model.
2. **HealthService** summarises steps, workouts, energy, heart rate and sleep from Apple Health.
3. **LocationService** clusters photo GPS points and reverse-geocodes them into a readable place trail.
4. **JournalGenerator** assembles all of it into a grounded prompt and calls **GitHub Models** with your token; the result is trimmed to ≤350 words.
5. The entry is persisted locally with **SwiftData** and shown in a reverse-chronological timeline.

## Requirements

- **macOS with Xcode 16+** (the project uses file-system–synchronized groups) to build/sign/run.
- An **iPhone running iOS 17+** (HealthKit and full Photos metadata don't work on Simulator).
- A **GitHub token** with the **Models** permission (uses your GitHub Models / Copilot allowance).

## Setup

1. Open `AutoJournal.xcodeproj` in Xcode.
2. Select the **AutoJournal** target → **Signing & Capabilities** → set your **Team** and a unique **Bundle Identifier** (replace `com.example.AutoJournal`). The **HealthKit** capability is already declared in `AutoJournal.entitlements`.
3. Create a GitHub token:
   - Go to **github.com → Settings → Developer settings → Fine-grained personal access tokens**.
   - Grant the **Models** permission. Copy the token.
4. Build and run on your iPhone.
5. In the app: open **Settings** (gear icon) → paste the token → grant **Photos** and **Health** access.
6. Tap **+** → pick a day → optionally add notes → **Generate**.

The token is stored only in the device **Keychain**. All data stays on-device except the few photos + day summary sent to GitHub Models to write each entry.

## What it can and can't pull in (iOS reality)

| Source | Status |
| --- | --- |
| Camera roll photos/videos (time + GPS) | ✅ PhotoKit |
| Activity & biometrics (WHOOP via Apple Health) | ✅ HealthKit |
| Where you went | ✅ Derived from photo GPS + reverse geocoding |
| WhatsApp / Messenger / call history | ❌ No public iOS API — sandboxed by Apple |
| Google Maps Timeline | ❌ API deprecated/removed |

For the sources iOS blocks, add context yourself in the **Notes** field when generating — it's woven into the entry. See the roadmap below for future options.

## Project structure

```
AutoJournal/
├── AutoJournalApp.swift        App entry + SwiftData container
├── Info.plist                  Usage descriptions (Photos/Health)
├── AutoJournal.entitlements    HealthKit capability
├── Models/
│   ├── JournalEntry.swift      @Model persisted entry
│   └── DaySignals.swift        Aggregated day input
├── Services/
│   ├── PhotoService.swift      PhotoKit fetch + base64 images
│   ├── HealthService.swift     HealthKit summary
│   ├── LocationService.swift   GPS → place trail
│   ├── GitHubModelsClient.swift OpenAI-compatible multimodal client
│   └── JournalGenerator.swift  Pipeline + prompt + length cap
├── Support/
│   ├── KeychainStore.swift     Token storage
│   ├── AppSettings.swift       Settings + model choice
│   └── NotificationScheduler.swift  Daily nudge
└── Views/
    ├── TimelineView.swift      Entry list (root)
    ├── EntryDetailView.swift   Narrative + hero photos
    ├── GenerateSheet.swift     Day picker + notes + generate
    ├── SettingsView.swift      Token, model, permissions
    └── PhotoThumbnail.swift    PHAsset image loader
```

## Roadmap / future ideas

- **Social & calls:** iOS Shortcuts automations, or importing exported chat/Maps Timeline archives, to fold in social context automatically.
- **Background generation:** use `BGTaskScheduler` (identifier already registered) to pre-draft yesterday's entry overnight.
- **On-device option:** Apple Intelligence / Vision for a fully private mode.
- **Export:** share/print a month or year of entries as a keepsake.

## Notes

- `com.example.AutoJournal` appears in the bundle id, Keychain service, and background-task identifiers — change consistently if you rebrand.
- GitHub Models has per-tier rate limits; a few entries per day sits comfortably within them.
