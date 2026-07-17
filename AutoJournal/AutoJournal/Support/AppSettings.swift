import Foundation
import SwiftUI

/// User-configurable settings backed by `UserDefaults` (non-secret) and the
/// Keychain (the GitHub token). Injected into the environment so any view can
/// observe changes.
@MainActor
final class AppSettings: ObservableObject {
    @AppStorage("selectedModel") var selectedModel: String = GitHubModel.gpt55.rawValue
    /// Number of representative photos to send to the model per day.
    @AppStorage("maxPhotosPerDay") var maxPhotosPerDay: Int = 6
    /// Whether the daily nudge notification is enabled.
    @AppStorage("dailyNudgeEnabled") var dailyNudgeEnabled: Bool = false

    /// Published mirror of Keychain token presence so views update on change.
    @Published private(set) var hasToken: Bool = KeychainStore.hasToken

    var model: GitHubModel {
        GitHubModel(rawValue: selectedModel) ?? .gpt55
    }

    func token() -> String? { KeychainStore.loadToken() }

    func setToken(_ token: String) {
        KeychainStore.saveToken(token)
        hasToken = KeychainStore.hasToken
    }

    func clearToken() {
        KeychainStore.deleteToken()
        hasToken = false
    }
}

/// Multimodal models available through the GitHub Models catalog.
enum GitHubModel: String, CaseIterable, Identifiable {
    case gpt55 = "openai/gpt-5.5"
    case gpt4o = "openai/gpt-4o"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .gpt55: return "GPT-5.5 (recommended)"
        case .gpt4o: return "GPT-4o (fallback)"
        }
    }

    /// GPT-5.x reasoning models reject a custom `temperature` and need a larger
    /// completion budget to cover hidden reasoning tokens plus the entry.
    var isReasoningModel: Bool {
        switch self {
        case .gpt55: return true
        case .gpt4o: return false
        }
    }
}
