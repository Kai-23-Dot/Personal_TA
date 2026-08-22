import SwiftUI

struct AssignmentsView: View {
    @EnvironmentObject private var store: AppStore
    @State private var searchText = ""
    @State private var filter: AssignmentFilter = .upcoming
    @State private var selectedCourseID = "all"

    private var filteredAssignments: [Assignment] {
        store.assignments
            .filter { assignment in
                switch filter {
                case .upcoming:
                    return !assignment.isCompleted && (assignment.dueDate ?? .distantFuture) >= Calendar.current.startOfDay(for: .now)
                case .completed:
                    return assignment.isCompleted
                case .all:
                    return true
                }
            }
            .filter { selectedCourseID == "all" || $0.courseID == selectedCourseID }
            .filter {
                searchText.isEmpty ||
                $0.title.localizedCaseInsensitiveContains(searchText) ||
                $0.courseName.localizedCaseInsensitiveContains(searchText)
            }
            .sorted { ($0.dueDate ?? .distantFuture) < ($1.dueDate ?? .distantFuture) }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    pageHeader
                    searchAndFilter

                    Picker("Assignment status", selection: $filter) {
                        ForEach(AssignmentFilter.allCases) { option in
                            Text(option.rawValue).tag(option)
                        }
                    }
                    .pickerStyle(.segmented)

                    if filteredAssignments.isEmpty {
                        ContentUnavailableView(
                            "No assignments",
                            systemImage: "checkmark.circle",
                            description: Text("Try another filter or enjoy the breathing room.")
                        )
                        .foregroundStyle(SmartlearnTheme.textSecondary)
                        .padding(.top, 44)
                    } else {
                        ForEach(filteredAssignments) { assignment in
                            AssignmentCard(assignment: assignment) {
                                withAnimation(.easeInOut(duration: 0.2)) {
                                    store.toggleCompletion(for: assignment)
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 14)
                .padding(.bottom, 30)
            }
            .background(SmartlearnBackground())
            .navigationTitle("Assignments")
            .smartlearnNavigationStyle()
        }
    }

    private var pageHeader: some View {
        SurfaceCard {
            HStack(alignment: .top, spacing: 14) {
                Image(systemName: "checklist")
                    .font(.title2)
                    .foregroundStyle(SmartlearnTheme.primary)
                    .frame(width: 46, height: 46)
                    .background(SmartlearnTheme.primary.opacity(0.12), in: RoundedRectangle(cornerRadius: 13))
                VStack(alignment: .leading, spacing: 4) {
                    Text("Stay ahead of every deadline")
                        .font(.headline)
                        .foregroundStyle(SmartlearnTheme.textPrimary)
                    Text("Assignments from Canvas appear here when the mobile app is connected.")
                        .font(.caption)
                        .foregroundStyle(SmartlearnTheme.textSecondary)
                }
            }
        }
    }

    private var searchAndFilter: some View {
        HStack(spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(SmartlearnTheme.textSecondary)
                TextField("Search", text: $searchText)
                    .textInputAutocapitalization(.never)
                    .foregroundStyle(SmartlearnTheme.textPrimary)
            }
            .padding(.horizontal, 12)
            .frame(height: 44)
            .background(SmartlearnTheme.surface, in: RoundedRectangle(cornerRadius: 12))
            .overlay {
                RoundedRectangle(cornerRadius: 12).stroke(SmartlearnTheme.border)
            }

            Menu {
                Button("All courses") { selectedCourseID = "all" }
                ForEach(store.courses) { course in
                    Button(course.name) { selectedCourseID = course.id }
                }
            } label: {
                Image(systemName: "line.3.horizontal.decrease")
                    .frame(width: 44, height: 44)
                    .background(SmartlearnTheme.surface, in: RoundedRectangle(cornerRadius: 12))
                    .overlay {
                        RoundedRectangle(cornerRadius: 12).stroke(SmartlearnTheme.border)
                    }
            }
            .accessibilityLabel("Filter by course")
        }
    }
}

private enum AssignmentFilter: String, CaseIterable, Identifiable {
    case upcoming = "Upcoming"
    case completed = "Completed"
    case all = "All"

    var id: String { rawValue }
}

private struct AssignmentCard: View {
    let assignment: Assignment
    let toggleCompletion: () -> Void

    var body: some View {
        SurfaceCard {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 12) {
                    Button(action: toggleCompletion) {
                        Image(systemName: assignment.isCompleted ? "checkmark.circle.fill" : "circle")
                            .font(.title3)
                            .foregroundStyle(assignment.isCompleted ? SmartlearnTheme.mint : SmartlearnTheme.textSecondary)
                    }
                    .accessibilityLabel(assignment.isCompleted ? "Mark incomplete" : "Mark complete")

                    VStack(alignment: .leading, spacing: 5) {
                        Text(assignment.title)
                            .font(.headline)
                            .foregroundStyle(SmartlearnTheme.textPrimary)
                            .strikethrough(assignment.isCompleted)
                        Text(assignment.courseName)
                            .font(.caption)
                            .foregroundStyle(SmartlearnTheme.textSecondary)
                    }
                    Spacer()
                    if let color = assignment.course?.color {
                        Circle()
                            .fill(Color(hex: color))
                            .frame(width: 9, height: 9)
                    }
                }

                if let description = assignment.description {
                    Text(description)
                        .font(.subheadline)
                        .foregroundStyle(SmartlearnTheme.textSecondary)
                        .lineLimit(2)
                }

                HStack {
                    StatusPill(
                        title: (assignment.assignmentType ?? "Assignment").capitalized,
                        color: SmartlearnTheme.primary
                    )
                    Spacer()
                    Label(
                        assignment.dueDate?.formatted(date: .abbreviated, time: .shortened) ?? "No due date",
                        systemImage: "calendar"
                    )
                    .font(.caption)
                    .foregroundStyle(assignment.urgency == .today ? SmartlearnTheme.orange : SmartlearnTheme.textSecondary)
                }
            }
        }
    }
}
