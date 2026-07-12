import SwiftUI
import SwiftData

/// Full view of a single day's entry, with hero photos and the narrative.
struct EntryDetailView: View {
    @Bindable var entry: JournalEntry
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var settings: AppSettings

    @State private var isRegenerating = false
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if !entry.heroPhotoIdentifiers.isEmpty {
                    photoStrip
                }

                Text(entry.narrative)
                    .font(.body)
                    .lineSpacing(4)
                    .frame(maxWidth: .infinity, alignment: .leading)

                if !entry.placeTrail.isEmpty {
                    detailSection(title: "Where I went", systemImage: "map") {
                        Text(entry.placeTrail.joined(separator: " → "))
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }

                if !entry.healthSummary.isEmpty {
                    detailSection(title: "How my body moved", systemImage: "heart") {
                        Text(entry.healthSummary)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }

                if !entry.manualNote.isEmpty {
                    detailSection(title: "My notes", systemImage: "pencil") {
                        Text(entry.manualNote)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }

                metadataFooter
            }
            .padding()
        }
        .navigationTitle(entry.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await regenerate() }
                } label: {
                    if isRegenerating {
                        ProgressView()
                    } else {
                        Label("Regenerate", systemImage: "arrow.clockwise")
                    }
                }
                .disabled(isRegenerating)
            }
        }
        .alert("Couldn't regenerate", isPresented: .constant(errorMessage != nil)) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private var photoStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(entry.heroPhotoIdentifiers, id: \.self) { id in
                    PhotoThumbnail(identifier: id, targetDimension: 500)
                        .frame(width: 220, height: 280)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                }
            }
        }
    }

    private func detailSection<Content: View>(
        title: String,
        systemImage: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(title, systemImage: systemImage)
                .font(.headline)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var metadataFooter: some View {
        VStack(alignment: .leading, spacing: 4) {
            Divider()
            Text("\(entry.wordCount) words · \(entry.photoLocalIdentifiers.count) photos considered")
            Text("Generated \(entry.generatedAt.formatted(date: .abbreviated, time: .shortened))")
            if !entry.modelName.isEmpty {
                Text("Model: \(entry.modelName)")
            }
        }
        .font(.caption)
        .foregroundStyle(.tertiary)
    }

    @MainActor
    private func regenerate() async {
        isRegenerating = true
        defer { isRegenerating = false }
        let generator = JournalGenerator(tokenProvider: { settings.token() })
        do {
            let result = try await generator.generate(
                for: entry.dayStart,
                manualNote: entry.manualNote,
                model: settings.model.rawValue,
                maxPhotos: settings.maxPhotosPerDay
            )
            entry.narrative = result.narrative
            entry.placeTrail = result.placeTrail
            entry.healthSummary = result.healthSummary
            entry.photoLocalIdentifiers = result.photoIdentifiers
            entry.heroPhotoIdentifiers = result.heroIdentifiers
            entry.generatedAt = .now
            entry.modelName = result.modelName
            entry.wordCount = result.wordCount
            try? modelContext.save()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
