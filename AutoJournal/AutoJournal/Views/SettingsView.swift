import SwiftUI

/// Settings: GitHub token, model choice, photo budget, permissions and the
/// optional daily nudge. Also the place where the privacy tradeoff is spelled out.
struct SettingsView: View {
    @EnvironmentObject private var settings: AppSettings
    @Environment(\.dismiss) private var dismiss

    @State private var tokenInput = ""
    @State private var photoStatus = ""
    @State private var healthStatus = ""

    private let photoService = PhotoService()
    private let healthService = HealthService()

    var body: some View {
        NavigationStack {
            Form {
                tokenSection
                modelSection
                permissionsSection
                nudgeSection
                privacySection
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private var tokenSection: some View {
        Section {
            if settings.hasToken {
                Label("Token saved securely in the Keychain", systemImage: "checkmark.seal.fill")
                    .foregroundStyle(.green)
                Button("Replace token", role: .destructive) {
                    settings.clearToken()
                    tokenInput = ""
                }
            } else {
                SecureField("ghp_… or fine-grained token", text: $tokenInput)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Button("Save token") {
                    settings.setToken(tokenInput)
                    tokenInput = ""
                }
                .disabled(tokenInput.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        } header: {
            Text("GitHub token")
        } footer: {
            Text("Create a fine-grained token with the **Models** permission at github.com/settings/personal-access-tokens. It uses your existing GitHub Models allowance. Stored only in your device Keychain.")
        }
    }

    private var modelSection: some View {
        Section("Model & budget") {
            Picker("Model", selection: $settings.selectedModel) {
                ForEach(GitHubModel.allCases) { model in
                    Text(model.displayName).tag(model.rawValue)
                }
            }
            Stepper(
                "Photos sent per day: \(settings.maxPhotosPerDay)",
                value: $settings.maxPhotosPerDay,
                in: 2...12
            )
        }
    }

    private var permissionsSection: some View {
        Section {
            HStack {
                Text("Photos")
                Spacer()
                Text(photoStatus).foregroundStyle(.secondary)
                Button("Grant") { Task { await requestPhotos() } }
                    .buttonStyle(.bordered)
            }
            HStack {
                Text("Health")
                Spacer()
                Text(healthStatus).foregroundStyle(.secondary)
                Button("Grant") { Task { await requestHealth() } }
                    .buttonStyle(.bordered)
            }
        } header: {
            Text("Permissions")
        } footer: {
            Text("Location place names come from the GPS already inside your photos, so no separate location permission is required.")
        }
    }

    private var nudgeSection: some View {
        Section {
            Toggle("Daily nudge at 9pm", isOn: Binding(
                get: { settings.dailyNudgeEnabled },
                set: { newValue in
                    settings.dailyNudgeEnabled = newValue
                    Task { await NotificationScheduler.shared.setDailyNudge(enabled: newValue) }
                }
            ))
        } header: {
            Text("Reminders")
        } footer: {
            Text("A gentle evening reminder to capture the day you just had.")
        }
    }

    private var privacySection: some View {
        Section("Privacy") {
            Text("Everything lives on your device except the handful of photos and the day's summary sent to GitHub Models to write the entry. Your token never leaves the Keychain.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    @MainActor
    private func requestPhotos() async {
        let ok = await photoService.requestAccess()
        photoStatus = ok ? "Allowed" : "Denied"
    }

    @MainActor
    private func requestHealth() async {
        guard healthService.isAvailable else {
            healthStatus = "Unavailable"
            return
        }
        let ok = await healthService.requestAccess()
        healthStatus = ok ? "Requested" : "Denied"
    }
}
