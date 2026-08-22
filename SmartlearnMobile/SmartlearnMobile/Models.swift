import Foundation

struct UserProfile: Codable, Hashable {
    var fullName: String?

    var firstName: String {
        fullName?
            .split(separator: " ")
            .first
            .map(String.init) ?? "Student"
    }
}

struct Course: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    var color: String?
    var section: String?
    var teacherName: String?
    var platform: String?
    var updatedAt: Date?

    var initials: String {
        let words = name.split(separator: " ")
        return words.prefix(2).compactMap(\.first).map(String.init).joined()
    }
}

struct CourseSummary: Codable, Hashable {
    let id: String?
    let name: String
    let color: String?
}

struct Assignment: Codable, Identifiable, Hashable {
    let id: String
    var title: String
    var description: String?
    var assignmentType: String?
    var dueDate: Date?
    var isCompleted: Bool
    var courseID: String?
    var course: CourseSummary?

    var courseName: String {
        course?.name ?? "General"
    }

    var urgency: AssignmentUrgency {
        guard let dueDate else { return .none }
        if dueDate < .now { return .pastDue }
        let hours = dueDate.timeIntervalSinceNow / 3_600
        if hours < 24 { return .today }
        if hours < 48 { return .tomorrow }
        return .upcoming
    }
}

enum AssignmentUrgency: String {
    case today = "Due today"
    case tomorrow = "Due tomorrow"
    case upcoming = "Upcoming"
    case pastDue = "Past due"
    case none = "No due date"
}

struct StudyRecommendation: Identifiable, Hashable {
    let id: String
    let topic: String
    let courseName: String
    let reason: String
    let accuracy: Int?
}

struct Flashcard: Identifiable, Hashable {
    let id: String
    let front: String
    let back: String
    let courseName: String
}

struct NoteItem: Identifiable, Hashable {
    let id: String
    let title: String
    let preview: String
    let courseName: String
    let updatedAt: Date
}

enum AppTab: Hashable {
    case home
    case assignments
    case practice
    case flashcards
    case more
}
