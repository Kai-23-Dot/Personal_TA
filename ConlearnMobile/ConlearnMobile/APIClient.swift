import Foundation

enum APIClientError: LocalizedError {
    case invalidServerAddress
    case invalidResponse
    case unauthorized
    case server(status: Int, message: String)

    var errorDescription: String? {
        switch self {
        case .invalidServerAddress:
            return "Enter a valid HTTPS address for the Conlearn server."
        case .invalidResponse:
            return "The server returned an unreadable response."
        case .unauthorized:
            return "Sign-in is required. Native Supabase authentication is the next integration step."
        case let .server(status, message):
            return "Server error \(status): \(message)"
        }
    }
}

struct APIClient: Sendable {
    let baseURL: URL
    let session: URLSession

    init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func fetchProfile() async throws -> UserProfile {
        try await get("/api/profile")
    }

    func fetchCourses() async throws -> [Course] {
        try await get("/api/courses")
    }

    func fetchAssignments() async throws -> [Assignment] {
        try await get("/api/assignments")
    }

    private func get<Response: Decodable>(_ path: String) async throws -> Response {
        let cleanPath = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let url = cleanPath.split(separator: "/").reduce(baseURL) {
            $0.appendingPathComponent(String($1))
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIClientError.invalidResponse
        }
        if httpResponse.statusCode == 401 {
            throw APIClientError.unauthorized
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw APIClientError.server(status: httpResponse.statusCode, message: message)
        }

        return try Self.decoder.decode(Response.self, from: data)
    }

    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)
            let fractional = ISO8601DateFormatter()
            fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = fractional.date(from: value) {
                return date
            }
            let standard = ISO8601DateFormatter()
            standard.formatOptions = [.withInternetDateTime]
            if let date = standard.date(from: value) {
                return date
            }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Unsupported ISO-8601 date: \(value)"
            )
        }
        return decoder
    }()
}
