import Foundation
import HealthKit

/// A single workout captured that day.
struct WorkoutSummary: Identifiable, Hashable {
    let id = UUID()
    let type: String
    let minutes: Int
    let energyKcal: Int?
}

/// Compact activity + biometric picture for a day. Populated from HealthKit,
/// which also surfaces data written by third-party apps like WHOOP.
struct HealthSummary {
    var steps: Int?
    var activeEnergyKcal: Int?
    var distanceKm: Double?
    var averageHeartRate: Int?
    var restingHeartRate: Int?
    var sleepHours: Double?
    var workouts: [WorkoutSummary] = []

    /// One-line, prose-friendly rendering used in prompts and the UI.
    var narrativeLine: String {
        var parts: [String] = []
        if let steps { parts.append("\(steps.formatted()) steps") }
        if let distanceKm, distanceKm > 0.1 {
            parts.append(String(format: "%.1f km travelled on foot", distanceKm))
        }
        if let activeEnergyKcal { parts.append("\(activeEnergyKcal) kcal active energy") }
        if !workouts.isEmpty {
            let w = workouts.map { "\($0.type) (\($0.minutes) min)" }.joined(separator: ", ")
            parts.append("workouts: \(w)")
        }
        if let averageHeartRate { parts.append("avg HR \(averageHeartRate) bpm") }
        if let restingHeartRate { parts.append("resting HR \(restingHeartRate) bpm") }
        if let sleepHours, sleepHours > 0 {
            parts.append(String(format: "%.1f h sleep", sleepHours))
        }
        return parts.isEmpty ? "No activity data recorded." : parts.joined(separator: " · ")
    }

    var isEmpty: Bool {
        steps == nil && activeEnergyKcal == nil && distanceKm == nil
            && averageHeartRate == nil && restingHeartRate == nil
            && sleepHours == nil && workouts.isEmpty
    }
}

/// Reads activity and biometric data from HealthKit for a given day.
final class HealthService {
    private let store = HKHealthStore()

    private var readTypes: Set<HKObjectType> {
        var types: Set<HKObjectType> = [HKObjectType.workoutType()]
        if let t = HKObjectType.quantityType(forIdentifier: .stepCount) { types.insert(t) }
        if let t = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) { types.insert(t) }
        if let t = HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning) { types.insert(t) }
        if let t = HKObjectType.quantityType(forIdentifier: .heartRate) { types.insert(t) }
        if let t = HKObjectType.quantityType(forIdentifier: .restingHeartRate) { types.insert(t) }
        if let t = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { types.insert(t) }
        return types
    }

    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    /// Requests read authorization. Note: HealthKit never reveals whether the
    /// user granted read access, so callers should treat missing data as "none".
    func requestAccess() async -> Bool {
        guard isAvailable else { return false }
        return await withCheckedContinuation { continuation in
            store.requestAuthorization(toShare: [], read: readTypes) { success, _ in
                continuation.resume(returning: success)
            }
        }
    }

    /// Builds a `HealthSummary` for `date`, or nil if Health is unavailable.
    func summary(for date: Date, calendar: Calendar = .current) async -> HealthSummary? {
        guard isAvailable else { return nil }
        _ = await requestAccess()

        let dayStart = calendar.startOfDay(for: date)
        guard let dayEnd = calendar.date(byAdding: .day, value: 1, to: dayStart) else { return nil }
        let predicate = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd)

        var summary = HealthSummary()
        summary.steps = await sum(.stepCount, unit: .count(), predicate: predicate).map { Int($0) }
        summary.activeEnergyKcal = await sum(.activeEnergyBurned, unit: .kilocalorie(), predicate: predicate).map { Int($0) }
        summary.distanceKm = await sum(.distanceWalkingRunning, unit: .meter(), predicate: predicate).map { $0 / 1000.0 }
        summary.averageHeartRate = await average(.heartRate, unit: HKUnit.count().unitDivided(by: .minute()), predicate: predicate).map { Int($0) }
        summary.restingHeartRate = await average(.restingHeartRate, unit: HKUnit.count().unitDivided(by: .minute()), predicate: predicate).map { Int($0) }
        summary.sleepHours = await sleepHours(predicate: predicate)
        summary.workouts = await workouts(predicate: predicate)
        return summary
    }

    // MARK: - Query helpers

    private func sum(
        _ identifier: HKQuantityTypeIdentifier,
        unit: HKUnit,
        predicate: NSPredicate
    ) async -> Double? {
        guard let type = HKObjectType.quantityType(forIdentifier: identifier) else { return nil }
        return await withCheckedContinuation { continuation in
            let query = HKStatisticsQuery(
                quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum
            ) { _, stats, _ in
                continuation.resume(returning: stats?.sumQuantity()?.doubleValue(for: unit))
            }
            store.execute(query)
        }
    }

    private func average(
        _ identifier: HKQuantityTypeIdentifier,
        unit: HKUnit,
        predicate: NSPredicate
    ) async -> Double? {
        guard let type = HKObjectType.quantityType(forIdentifier: identifier) else { return nil }
        return await withCheckedContinuation { continuation in
            let query = HKStatisticsQuery(
                quantityType: type, quantitySamplePredicate: predicate, options: .discreteAverage
            ) { _, stats, _ in
                continuation.resume(returning: stats?.averageQuantity()?.doubleValue(for: unit))
            }
            store.execute(query)
        }
    }

    private func sleepHours(predicate: NSPredicate) async -> Double? {
        guard let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else { return nil }
        return await withCheckedContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil
            ) { _, samples, _ in
                guard let samples = samples as? [HKCategorySample], !samples.isEmpty else {
                    continuation.resume(returning: nil)
                    return
                }
                let asleepValues = Self.asleepValues
                let seconds = samples
                    .filter { asleepValues.contains($0.value) }
                    .reduce(0.0) { $0 + $1.endDate.timeIntervalSince($1.startDate) }
                continuation.resume(returning: seconds > 0 ? seconds / 3600.0 : nil)
            }
            store.execute(query)
        }
    }

    private func workouts(predicate: NSPredicate) async -> [WorkoutSummary] {
        await withCheckedContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: HKObjectType.workoutType(),
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)]
            ) { _, samples, _ in
                let workouts = (samples as? [HKWorkout] ?? []).map { workout -> WorkoutSummary in
                    let minutes = Int(workout.duration / 60.0)
                    let kcal = workout.statistics(for: HKQuantityType(.activeEnergyBurned))?
                        .sumQuantity()?.doubleValue(for: .kilocalorie())
                    return WorkoutSummary(
                        type: workout.workoutActivityType.displayName,
                        minutes: minutes,
                        energyKcal: kcal.map { Int($0) }
                    )
                }
                continuation.resume(returning: workouts)
            }
            store.execute(query)
        }
    }

    /// All category values that count as "asleep" across iOS versions.
    private static var asleepValues: Set<Int> {
        var values: Set<Int> = [HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue]
        if #available(iOS 16.0, *) {
            values.insert(HKCategoryValueSleepAnalysis.asleepCore.rawValue)
            values.insert(HKCategoryValueSleepAnalysis.asleepDeep.rawValue)
            values.insert(HKCategoryValueSleepAnalysis.asleepREM.rawValue)
        }
        return values
    }
}

private extension HKWorkoutActivityType {
    var displayName: String {
        switch self {
        case .running: return "Run"
        case .walking: return "Walk"
        case .cycling: return "Cycle"
        case .hiking: return "Hike"
        case .swimming: return "Swim"
        case .yoga: return "Yoga"
        case .functionalStrengthTraining, .traditionalStrengthTraining: return "Strength"
        case .highIntensityIntervalTraining: return "HIIT"
        case .tennis: return "Tennis"
        case .soccer: return "Football"
        case .basketball: return "Basketball"
        case .rowing: return "Row"
        case .elliptical: return "Elliptical"
        case .dance: return "Dance"
        case .pilates: return "Pilates"
        default: return "Workout"
        }
    }
}
