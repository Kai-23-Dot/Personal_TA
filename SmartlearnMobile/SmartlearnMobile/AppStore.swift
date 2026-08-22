import Combine
import Foundation

@MainActor
final class AppStore: ObservableObject {
    @Published var profile = UserProfile(fullName: "Alex Morgan")
    @Published var courses: [Course] = []
    @Published var assignments: [Assignment] = []
    @Published var recommendations: [StudyRecommendation] = []
    @Published var flashcards: [Flashcard] = []
    @Published var notes: [NoteItem] = []
    @Published var selectedTab: AppTab = .home
    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var useDemoData: Bool {
        didSet { defaults.set(useDemoData, forKey: Keys.demoMode) }
    }
    @Published var serverAddress: String {
        didSet { defaults.set(serverAddress, forKey: Keys.serverAddress) }
    }

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if defaults.object(forKey: Keys.demoMode) == nil {
            useDemoData = true
        } else {
            useDemoData = defaults.bool(forKey: Keys.demoMode)
        }
        serverAddress = defaults.string(forKey: Keys.serverAddress) ?? ""
        loadDemoData()
    }

    var upcomingAssignments: [Assignment] {
        assignments
            .filter { !$0.isCompleted && ($0.dueDate ?? .distantFuture) >= Calendar.current.startOfDay(for: .now) }
            .sorted { ($0.dueDate ?? .distantFuture) < ($1.dueDate ?? .distantFuture) }
    }

    var dueThisWeekCount: Int {
        let end = Calendar.current.date(byAdding: .day, value: 7, to: .now) ?? .now
        return upcomingAssignments.filter { ($0.dueDate ?? .distantFuture) <= end }.count
    }

    var urgentCount: Int {
        upcomingAssignments.filter { assignment in
            guard let due = assignment.dueDate else { return false }
            return due.timeIntervalSinceNow < 48 * 3_600
        }.count
    }

    func refresh() async {
        errorMessage = nil
        if useDemoData {
            loadDemoData()
            return
        }

        guard let url = normalizedServerURL else {
            errorMessage = APIClientError.invalidServerAddress.localizedDescription
            return
        }

        isLoading = true
        defer { isLoading = false }

        do {
            let client = APIClient(baseURL: url)
            async let profileRequest = client.fetchProfile()
            async let coursesRequest = client.fetchCourses()
            async let assignmentsRequest = client.fetchAssignments()
            let (newProfile, newCourses, newAssignments) = try await (
                profileRequest,
                coursesRequest,
                assignmentsRequest
            )
            profile = newProfile
            courses = newCourses
            assignments = newAssignments
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func toggleCompletion(for assignment: Assignment) {
        guard let index = assignments.firstIndex(where: { $0.id == assignment.id }) else { return }
        assignments[index].isCompleted.toggle()
    }

    func resetDemoData() {
        useDemoData = true
        loadDemoData()
        errorMessage = nil
    }

    private var normalizedServerURL: URL? {
        let trimmed = serverAddress.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty,
              let url = URL(string: trimmed),
              url.scheme == "https",
              url.host != nil
        else {
            return nil
        }
        return url
    }

    private func loadDemoData() {
        let calendar = Calendar.current
        func date(days: Int, hour: Int) -> Date {
            let day = calendar.date(byAdding: .day, value: days, to: .now) ?? .now
            return calendar.date(bySettingHour: hour, minute: 0, second: 0, of: day) ?? day
        }

        profile = UserProfile(fullName: "Alex Morgan")
        courses = [
            Course(id: "bio-101", name: "Biology 101", color: "#62D6B4", section: "Period 2", teacherName: "Dr. Chen", platform: "canvas", updatedAt: .now),
            Course(id: "calc-ab", name: "AP Calculus AB", color: "#8AB4FF", section: "Period 4", teacherName: "Ms. Patel", platform: "canvas", updatedAt: .now),
            Course(id: "world-history", name: "World History", color: "#C4A7FF", section: "Period 6", teacherName: "Mr. Rivera", platform: "canvas", updatedAt: .now)
        ]
        assignments = [
            Assignment(
                id: "a1",
                title: "Cellular Respiration Lab",
                description: "Complete the analysis and conclusion sections.",
                assignmentType: "lab",
                dueDate: date(days: 1, hour: 23),
                isCompleted: false,
                courseID: "bio-101",
                course: CourseSummary(id: "bio-101", name: "Biology 101", color: "#62D6B4")
            ),
            Assignment(
                id: "a2",
                title: "Applications of Derivatives",
                description: "Problems 1–24, even.",
                assignmentType: "assignment",
                dueDate: date(days: 3, hour: 8),
                isCompleted: false,
                courseID: "calc-ab",
                course: CourseSummary(id: "calc-ab", name: "AP Calculus AB", color: "#8AB4FF")
            ),
            Assignment(
                id: "a3",
                title: "Industrial Revolution Essay",
                description: "Submit a polished five-paragraph response.",
                assignmentType: "essay",
                dueDate: date(days: 5, hour: 15),
                isCompleted: false,
                courseID: "world-history",
                course: CourseSummary(id: "world-history", name: "World History", color: "#C4A7FF")
            ),
            Assignment(
                id: "a4",
                title: "Genetics Vocabulary",
                description: "Review the key terms from chapter 9.",
                assignmentType: "quiz",
                dueDate: date(days: -1, hour: 12),
                isCompleted: true,
                courseID: "bio-101",
                course: CourseSummary(id: "bio-101", name: "Biology 101", color: "#62D6B4")
            )
        ]
        recommendations = [
            StudyRecommendation(
                id: "r1",
                topic: "Chain Rule",
                courseName: "AP Calculus AB",
                reason: "Recent practice shows this is your highest-impact mastery gap.",
                accuracy: 58
            ),
            StudyRecommendation(
                id: "r2",
                topic: "Cellular Respiration",
                courseName: "Biology 101",
                reason: "A lab is due tomorrow and this topic has not been reviewed.",
                accuracy: 72
            ),
            StudyRecommendation(
                id: "r3",
                topic: "Industrialization",
                courseName: "World History",
                reason: "Review your source notes before drafting the upcoming essay.",
                accuracy: nil
            )
        ]
        flashcards = [
            Flashcard(id: "f1", front: "What is glycolysis?", back: "The process that breaks glucose into pyruvate in the cytoplasm.", courseName: "Biology 101"),
            Flashcard(id: "f2", front: "State the chain rule.", back: "The derivative of f(g(x)) is f′(g(x)) · g′(x).", courseName: "AP Calculus AB"),
            Flashcard(id: "f3", front: "What drove urbanization?", back: "Industrial jobs drew workers from rural areas into rapidly growing cities.", courseName: "World History")
        ]
        notes = [
            NoteItem(id: "n1", title: "Chapter 8 — Cellular Energy", preview: "ATP, glycolysis, the Krebs cycle, and oxidative phosphorylation…", courseName: "Biology 101", updatedAt: date(days: 0, hour: 10)),
            NoteItem(id: "n2", title: "Derivative Rules", preview: "Power, product, quotient, and chain rule worked examples…", courseName: "AP Calculus AB", updatedAt: date(days: -1, hour: 17)),
            NoteItem(id: "n3", title: "Industrial Revolution Sources", preview: "Primary-source excerpts and lecture highlights…", courseName: "World History", updatedAt: date(days: -2, hour: 13))
        ]
    }

    private enum Keys {
        static let demoMode = "smartlearn.mobile.demoMode"
        static let serverAddress = "smartlearn.mobile.serverAddress"
    }
}
