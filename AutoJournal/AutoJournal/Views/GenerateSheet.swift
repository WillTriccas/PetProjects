import SwiftUI
import SwiftData

/// Sheet for creating (or refreshing) a day's entry: pick the day, add optional
/// notes the OS can't capture (social/calls/feelings), then generate.
struct GenerateSheet: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var settings: AppSettings

    @State private var selectedDate = Calendar.current.startOfDay(for: .now)
    @State private var manualNote = ""
    @State private var isGenerating = false
    @State private var statusMessage = ""
    @State private var errorMessage: String?

    private var dateRange: ClosedRange<Date> {
        let start = Calendar.current.date(byAdding: .year, value: -5, to: .now) ?? .now
        return start...Date.now
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Which day?") {
                    DatePicker(
                        "Day",
                        selection: $selectedDate,
                        in: dateRange,
                        displayedComponents: .date
                    )
                }

                Section {
                    TextField(
                        "Anything the phone can't see — who you saw, calls, how you felt…",
                        text: $manualNote,
                        axis: .vertical
                    )
                    .lineLimit(3...6)
                } header: {
                    Text("Notes (optional)")
                } footer: {
                    Text("WhatsApp, Messenger and call history can't be read by iOS apps, so jot any social context here and it'll be woven into the entry.")
                }

                if !settings.hasToken {
                    Section {
                        Label(
                            "Add a GitHub token in Settings to enable generation.",
                            systemImage: "exclamationmark.triangle"
                        )
                        .foregroundStyle(.orange)
                    }
                }

                if isGenerating {
                    Section {
                        HStack(spacing: 10) {
                            ProgressView()
                            Text(statusMessage.isEmpty ? "Weaving your day…" : statusMessage)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .navigationTitle("New Entry")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Generate") {
                        Task { await generate() }
                    }
                    .disabled(isGenerating || !settings.hasToken)
                }
            }
            .alert("Couldn't generate", isPresented: .constant(errorMessage != nil)) {
                Button("OK") { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    @MainActor
    private func generate() async {
        isGenerating = true
        statusMessage = "Gathering photos, activity and places…"
        defer { isGenerating = false }

        let generator = JournalGenerator(tokenProvider: { settings.token() })
        do {
            let result = try await generator.generate(
                for: selectedDate,
                manualNote: manualNote,
                model: settings.model.rawValue,
                maxPhotos: settings.maxPhotosPerDay
            )
            upsert(result)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Insert a new entry, or replace the existing one for that day.
    private func upsert(_ result: JournalGenerator.Result) {
        let dayStart = result.dayStart
        let descriptor = FetchDescriptor<JournalEntry>(
            predicate: #Predicate { $0.dayStart == dayStart }
        )
        let existing = try? modelContext.fetch(descriptor).first

        if let entry = existing {
            entry.narrative = result.narrative
            entry.placeTrail = result.placeTrail
            entry.healthSummary = result.healthSummary
            entry.photoLocalIdentifiers = result.photoIdentifiers
            entry.heroPhotoIdentifiers = result.heroIdentifiers
            entry.manualNote = result.manualNote
            entry.generatedAt = .now
            entry.modelName = result.modelName
            entry.wordCount = result.wordCount
        } else {
            let entry = JournalEntry(
                dayStart: result.dayStart,
                narrative: result.narrative,
                placeTrail: result.placeTrail,
                healthSummary: result.healthSummary,
                photoLocalIdentifiers: result.photoIdentifiers,
                heroPhotoIdentifiers: result.heroIdentifiers,
                manualNote: result.manualNote,
                generatedAt: .now,
                modelName: result.modelName,
                wordCount: result.wordCount
            )
            modelContext.insert(entry)
        }
        try? modelContext.save()
    }
}
