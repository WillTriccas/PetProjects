import Foundation

/// Client for the GitHub Models inference API (OpenAI-compatible).
///
/// Authentication uses a GitHub token with the `models` permission, tied to the
/// user's Copilot/enterprise allowance. The endpoint accepts multimodal chat
/// completions, so photos are passed inline as base64 `data:` URIs.
final class GitHubModelsClient {

    enum ClientError: LocalizedError {
        case missingToken
        case rateLimited
        case http(status: Int, body: String)
        case emptyResponse
        case transport(String)

        var errorDescription: String? {
            switch self {
            case .missingToken:
                return "No GitHub token set. Add one in Settings to enable generation."
            case .rateLimited:
                return "GitHub Models rate limit hit. Wait a little and try again."
            case let .http(status, body):
                return "GitHub Models returned HTTP \(status): \(body)"
            case .emptyResponse:
                return "The model returned an empty response."
            case let .transport(message):
                return "Network error: \(message)"
            }
        }
    }

    private let endpoint = URL(string: "https://models.github.ai/inference/chat/completions")!
    private let tokenProvider: () -> String?

    init(tokenProvider: @escaping () -> String?) {
        self.tokenProvider = tokenProvider
    }

    /// Sends a multimodal completion request and returns the assistant text.
    /// - Parameters:
    ///   - model: e.g. `openai/gpt-4o`.
    ///   - system: system prompt.
    ///   - userText: the assembled day context.
    ///   - imageDataURIs: base64 `data:image/jpeg;...` strings for hero photos.
    func complete(
        model: String,
        system: String,
        userText: String,
        imageDataURIs: [String],
        isReasoningModel: Bool = true,
        maxTokens: Int = 2000,
        temperature: Double = 0.6
    ) async throws -> String {
        guard let token = tokenProvider(), !token.isEmpty else {
            throw ClientError.missingToken
        }

        var userContent: [ContentPart] = [.init(type: "text", text: userText, imageURL: nil)]
        for uri in imageDataURIs {
            userContent.append(.init(type: "image_url", text: nil, imageURL: .init(url: uri)))
        }

        // Reasoning models (GPT-5.x) reject a custom `temperature` and use
        // `max_completion_tokens`; classic models use `max_tokens` + temperature.
        let body = ChatRequest(
            model: model,
            temperature: isReasoningModel ? nil : temperature,
            maxTokens: isReasoningModel ? nil : maxTokens,
            maxCompletionTokens: isReasoningModel ? maxTokens : nil,
            messages: [
                .init(role: "system", content: [.init(type: "text", text: system, imageURL: nil)]),
                .init(role: "user", content: userContent),
            ]
        )

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 90
        request.httpBody = try JSONEncoder().encode(body)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw ClientError.transport(error.localizedDescription)
        }

        guard let http = response as? HTTPURLResponse else {
            throw ClientError.emptyResponse
        }
        if http.statusCode == 429 { throw ClientError.rateLimited }
        guard (200..<300).contains(http.statusCode) else {
            let bodyText = String(data: data, encoding: .utf8) ?? "<no body>"
            throw ClientError.http(status: http.statusCode, body: String(bodyText.prefix(500)))
        }

        let decoded = try JSONDecoder().decode(ChatResponse.self, from: data)
        guard let text = decoded.choices.first?.message.content, !text.isEmpty else {
            throw ClientError.emptyResponse
        }
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

// MARK: - Wire format

private struct ChatRequest: Encodable {
    let model: String
    let temperature: Double?
    let maxTokens: Int?
    let maxCompletionTokens: Int?
    let messages: [Message]

    enum CodingKeys: String, CodingKey {
        case model, temperature, messages
        case maxTokens = "max_tokens"
        case maxCompletionTokens = "max_completion_tokens"
    }
}

private struct Message: Encodable {
    let role: String
    let content: [ContentPart]
}

private struct ContentPart: Encodable {
    let type: String
    let text: String?
    let imageURL: ImageURL?

    enum CodingKeys: String, CodingKey {
        case type, text
        case imageURL = "image_url"
    }

    struct ImageURL: Encodable {
        let url: String
    }
}

private struct ChatResponse: Decodable {
    struct Choice: Decodable {
        struct Msg: Decodable { let content: String? }
        let message: Msg
    }
    let choices: [Choice]
}
