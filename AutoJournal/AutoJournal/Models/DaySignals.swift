import Foundation

/// The complete, structured picture of a single day, assembled from every
/// available source and handed to `JournalGenerator` to produce a narrative.
struct DaySignals {
    /// Start of the day these signals describe.
    let date: Date
    /// Photos & videos taken that day, time-ordered.
    let photos: [PhotoSignal]
    /// Activity / biometric summary for the day (nil if Health unavailable).
    let health: HealthSummary?
    /// Ordered, de-duplicated place visits derived from photo GPS.
    let places: [PlaceVisit]
    /// Optional user-supplied context (social interactions, calls, feelings).
    let manualNote: String

    var hasAnySignal: Bool {
        !photos.isEmpty || health != nil || !places.isEmpty || !manualNote.isEmpty
    }
}
