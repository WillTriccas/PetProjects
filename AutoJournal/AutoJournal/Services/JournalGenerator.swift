import Foundation

/// Orchestrates the full pipeline: gather signals from Photos/Health/Location,
/// select representative images, prompt the model, and enforce the length cap.
final class JournalGenerator {

    /// Everything needed to persist a `JournalEntry`.
    struct Result {
        let dayStart: Date
        let narrative: String
        let placeTrail: [String]
        let healthSummary: String
        let photoIdentifiers: [String]
        let heroIdentifiers: [String]
        let manualNote: String
        let modelName: String
        let wordCount: Int
    }

    enum GenerationError: LocalizedError {
        case noSignals
        var errorDescription: String? {
            "There's nothing to journal for this day yet — no photos, activity, places, or notes were found."
        }
    }

    static let maxWords = 350

    private let photoService: PhotoService
    private let healthService: HealthService
    private let locationService: LocationService
    private let client: GitHubModelsClient

    init(tokenProvider: @escaping () -> String?) {
        self.photoService = PhotoService()
        self.healthService = HealthService()
        self.locationService = LocationService()
        self.client = GitHubModelsClient(tokenProvider: tokenProvider)
    }

    /// Runs the whole pipeline for `date`.
    func generate(
        for date: Date,
        manualNote: String,
        model: String,
        maxPhotos: Int,
        calendar: Calendar = .current
    ) async throws -> Result {
        let dayStart = calendar.startOfDay(for: date)

        // 1. Gather signals.
        let photos = (try? await photoService.photoSignals(for: dayStart)) ?? []
        let health = await healthService.summary(for: dayStart)
        let places = await locationService.placeTrail(from: photos)
        let signals = DaySignals(
            date: dayStart, photos: photos, health: health, places: places, manualNote: manualNote
        )
        guard signals.hasAnySignal else { throw GenerationError.noSignals }

        // 2. Choose hero photos spread across the day and fetch their pixels.
        let heroIds = Self.selectHeroPhotos(from: photos, max: maxPhotos)
        let imagesById = await photoService.base64JPEGs(for: heroIds)
        // Preserve time order when passing images to the model.
        let orderedImages = heroIds.compactMap { imagesById[$0] }

        // 3. Build prompt and call the model.
        let userText = Self.buildUserContext(from: signals)
        let raw = try await client.complete(
            model: model,
            system: Self.systemPrompt,
            userText: userText,
            imageDataURIs: orderedImages
        )
        let narrative = Self.trimToWordLimit(raw, limit: Self.maxWords)

        return Result(
            dayStart: dayStart,
            narrative: narrative,
            placeTrail: places.map(\.name),
            healthSummary: health?.narrativeLine ?? "",
            photoIdentifiers: photos.map(\.id),
            heroIdentifiers: heroIds,
            manualNote: manualNote,
            modelName: model,
            wordCount: Self.wordCount(narrative)
        )
    }

    // MARK: - Hero selection

    /// Evenly samples up to `max` photos across the time-ordered set so the
    /// chosen images represent the whole arc of the day rather than one moment.
    static func selectHeroPhotos(from photos: [PhotoSignal], max: Int) -> [String] {
        guard !photos.isEmpty else { return [] }
        guard photos.count > max else { return photos.map(\.id) }

        var picked: [String] = []
        let step = Double(photos.count) / Double(max)
        for i in 0..<max {
            let index = min(Int((Double(i) + 0.5) * step), photos.count - 1)
            picked.append(photos[index].id)
        }
        // De-duplicate while preserving order.
        var seen = Set<String>()
        return picked.filter { seen.insert($0).inserted }
    }

    // MARK: - Prompting

    static let systemPrompt = """
    You are a personal journaling companion. You write a short, warm, first-person \
    diary entry about the user's day, as if the user wrote it themselves that evening.

    Hard rules:
    - Ground EVERYTHING in the supplied photos and structured signals. Never invent \
      people, places, events, or feelings that aren't supported by the evidence.
    - Write in the first person ("I"), past tense, reflective but natural — not flowery.
    - 2 to 3 short paragraphs. Absolute maximum 350 words. Shorter is fine.
    - Weave in where I went, what I did, and how my body moved through the day when \
      that data is present, but don't just list stats — make it feel like a life lived.
    - The goal is to help me stop and appreciate the day. Notice small, human details \
      visible in the photos.
    - If evidence is thin, keep it brief and honest rather than padding.
    - Output only the diary entry text. No title, no headings, no bullet points.
    """

    /// Assembles the structured, human-readable context the model reads alongside images.
    static func buildUserContext(from signals: DaySignals) -> String {
        var lines: [String] = []
        let dayLabel = signals.date.formatted(.dateTime.weekday(.wide).day().month(.wide).year())
        lines.append("Date: \(dayLabel)")

        if !signals.places.isEmpty {
            lines.append("\nPlaces I visited (in order):")
            for place in signals.places {
                lines.append("- \(place.timeLabel)")
            }
        }

        if let health = signals.health, !health.isEmpty {
            lines.append("\nActivity & body: \(health.narrativeLine)")
        }

        if !signals.photos.isEmpty {
            lines.append("\nPhotos & videos taken (\(signals.photos.count) total):")
            for (index, photo) in signals.photos.enumerated() {
                var detail = "\(index + 1). \(photo.isVideo ? "Video" : "Photo") at \(photo.timeLabel)"
                if photo.coordinate != nil { detail += " (has location)" }
                lines.append(detail)
            }
            lines.append("\nThe attached images are a representative selection, in time order.")
        }

        if !signals.manualNote.isEmpty {
            lines.append("\nMy own notes for the day (social, calls, feelings): \(signals.manualNote)")
        }

        lines.append("\nWrite my diary entry for this day now.")
        return lines.joined(separator: "\n")
    }

    // MARK: - Length enforcement

    static func wordCount(_ text: String) -> Int {
        text.split { $0 == " " || $0.isNewline }.count
    }

    /// Safety net: if the model overshoots, trim to the last sentence that keeps
    /// the entry within `limit` words.
    static func trimToWordLimit(_ text: String, limit: Int) -> String {
        let words = text.split(separator: " ", omittingEmptySubsequences: true)
        guard words.count > limit else { return text }

        let truncated = words.prefix(limit).joined(separator: " ")
        if let lastTerminator = truncated.lastIndex(where: { ".!?".contains($0) }) {
            return String(truncated[...lastTerminator])
        }
        return truncated + "…"
    }
}
