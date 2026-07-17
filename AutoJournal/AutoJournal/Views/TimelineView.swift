import SwiftUI
import SwiftData

/// Root screen: a reverse-chronological list of daily journal entries.
struct JournalTimelineView: View {
    @Environment(\.modelContext) private var modelContext
    @EnvironmentObject private var settings: AppSettings
    @Query(sort: \JournalEntry.dayStart, order: .reverse) private var entries: [JournalEntry]

    @State private var showingGenerate = false
    @State private var showingSettings = false

    var body: some View {
        NavigationStack {
            Group {
                if entries.isEmpty {
                    emptyState
                } else {
                    List {
                        ForEach(entries) { entry in
                            NavigationLink(value: entry) {
                                EntryRow(entry: entry)
                            }
                        }
                        .onDelete(perform: delete)
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Auto Journal")
            .navigationDestination(for: JournalEntry.self) { entry in
                EntryDetailView(entry: entry)
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        showingSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingGenerate = true
                    } label: {
                        Label("New Entry", systemImage: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingGenerate) {
                GenerateSheet()
            }
            .sheet(isPresented: $showingSettings) {
                SettingsView()
            }
        }
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label("No entries yet", systemImage: "book.closed")
        } description: {
            Text("Tap + to weave your first day from your photos, activity, and places.")
        } actions: {
            Button("Create today's entry") { showingGenerate = true }
                .buttonStyle(.borderedProminent)
        }
    }

    private func delete(at offsets: IndexSet) {
        for index in offsets {
            modelContext.delete(entries[index])
        }
    }
}

/// A compact row summarising one day.
private struct EntryRow: View {
    let entry: JournalEntry

    var body: some View {
        HStack(spacing: 12) {
            if let hero = entry.heroPhotoIdentifiers.first {
                PhotoThumbnail(identifier: hero, targetDimension: 120)
                    .frame(width: 56, height: 56)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            } else {
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color.accentColor.opacity(0.15))
                    .frame(width: 56, height: 56)
                    .overlay(Image(systemName: "text.book.closed"))
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(entry.title)
                    .font(.headline)
                Text(entry.narrative)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                if !entry.placeTrail.isEmpty {
                    Text(entry.placeTrail.prefix(3).joined(separator: " · "))
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                }
            }
        }
        .padding(.vertical, 4)
    }
}
