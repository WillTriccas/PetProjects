import Foundation
import UserNotifications

/// Schedules an optional gentle evening reminder to capture the day.
///
/// This is a lightweight local notification (not background generation) — the
/// user still taps to generate, keeping photo access explicit and on-demand.
final class NotificationScheduler {
    static let shared = NotificationScheduler()
    private init() {}

    private let identifier = "com.example.AutoJournal.dailyNudge"
    private let hour = 21
    private let minute = 0

    /// Enables or disables the daily nudge. Requests authorization on enable.
    func setDailyNudge(enabled: Bool) async {
        let center = UNUserNotificationCenter.current()
        guard enabled else {
            center.removePendingNotificationRequests(withIdentifiers: [identifier])
            return
        }

        let granted = (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
        guard granted else { return }

        let content = UNMutableNotificationContent()
        content.title = "How was today?"
        content.body = "Take a moment to weave your day into your journal."
        content.sound = .default

        var components = DateComponents()
        components.hour = hour
        components.minute = minute
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: true)

        let request = UNNotificationRequest(
            identifier: identifier, content: content, trigger: trigger
        )
        center.removePendingNotificationRequests(withIdentifiers: [identifier])
        try? await center.add(request)
    }
}
