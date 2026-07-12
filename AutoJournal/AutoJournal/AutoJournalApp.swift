import SwiftUI
import SwiftData

@main
struct AutoJournalApp: App {
    /// Shared SwiftData container for persisted journal entries.
    let container: ModelContainer
    @StateObject private var settings = AppSettings()

    init() {
        do {
            container = try ModelContainer(for: JournalEntry.self)
        } catch {
            fatalError("Failed to create SwiftData ModelContainer: \(error)")
        }
    }

    var body: some Scene {
        WindowGroup {
            JournalTimelineView()
                .environmentObject(settings)
        }
        .modelContainer(container)
    }
}
