import Foundation
import SwiftData

/// A persisted journal entry — one per calendar day.
@Model
final class JournalEntry {
    /// Start-of-day timestamp used as the logical key for the entry.
    @Attribute(.unique) var dayStart: Date
    /// The generated narrative (2–3 paragraphs, <=350 words).
    var narrative: String
    /// Ordered, de-duplicated list of place names visited that day.
    var placeTrail: [String]
    /// Short human-readable summary of activity/biometrics for the day.
    var healthSummary: String
    /// PHAsset local identifiers for every photo/video considered.
    var photoLocalIdentifiers: [String]
    /// Subset of `photoLocalIdentifiers` chosen as the "hero" images to display.
    var heroPhotoIdentifiers: [String]
    /// Optional free-text the user added (e.g. social/calls context the OS can't provide).
    var manualNote: String
    /// When the narrative was generated.
    var generatedAt: Date
    /// The model that produced the narrative (for provenance).
    var modelName: String
    /// Word count of the narrative, cached for display.
    var wordCount: Int

    init(
        dayStart: Date,
        narrative: String,
        placeTrail: [String] = [],
        healthSummary: String = "",
        photoLocalIdentifiers: [String] = [],
        heroPhotoIdentifiers: [String] = [],
        manualNote: String = "",
        generatedAt: Date = .now,
        modelName: String = "",
        wordCount: Int = 0
    ) {
        self.dayStart = dayStart
        self.narrative = narrative
        self.placeTrail = placeTrail
        self.healthSummary = healthSummary
        self.photoLocalIdentifiers = photoLocalIdentifiers
        self.heroPhotoIdentifiers = heroPhotoIdentifiers
        self.manualNote = manualNote
        self.generatedAt = generatedAt
        self.modelName = modelName
        self.wordCount = wordCount
    }
}

extension JournalEntry {
    /// Human-friendly title, e.g. "Saturday, 12 July".
    var title: String {
        dayStart.formatted(.dateTime.weekday(.wide).day().month(.wide))
    }
}
