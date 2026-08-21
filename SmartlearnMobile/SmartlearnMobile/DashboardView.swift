import SwiftUI

struct DashboardView: View {
    @EnvironmentObject private var store: AppStore

    private let columns = [
        GridItem(.adaptive(minimum: 150), spacing: 12)
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 20) {
                    hero

                    if let errorMessage = store.errorMessage {
                        errorBanner(errorMessage)
                    }

                    metrics
                    dueThisWeek
                    quickActions
                    recommendations
                    connectionStatus
                }
                .padding(.horizontal, 16)
                .padding(.top, 12)
                .padding(.bottom, 28)
            }
            .background(SmartlearnBackground())
            .refreshable {
                await store.refresh()
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    HStack(spacing: 9) {
                        BrandMark(size: 30)
                        Text("Smartlearn")
                            .font(.headline.weight(.bold))
                            .foregroundStyle(SmartlearnTheme.textPrimary)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        store.selectedTab = .more
                    } label: {
                        Image(systemName: "person.crop.circle")
                            .font(.title3)
                    }
                    .accessibilityLabel("Open account and settings")
                }
            }
            .smartlearnNavigationStyle()
        }
    }

    private var hero: some View {
        SurfaceCard {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(Date.now.formatted(.dateTime.weekday(.wide).month(.wide).day()))
                        .font(.caption.weight(.medium))
                        .foregroundStyle(SmartlearnTheme.textSecondary)
                    Text("Good to see you, \(store.profile.firstName).")
                        .font(.title2.weight(.bold))
                        .foregroundStyle(SmartlearnTheme.textPrimary)
                    Text(heroSummary)
                        .font(.subheadline)
                        .foregroundStyle(SmartlearnTheme.textSecondary)
                }

                HStack(spacing: 10) {
                    Button {
                        store.selectedTab = .practice
                    } label: {
                        Label("Practice Test", systemImage: "bolt.fill")
                    }
                    .buttonStyle(PrimaryButtonStyle())

                    Button {
                        Task { await store.refresh() }
                    } label: {
                        Label(store.isLoading ? "Syncing…" : "Sync", systemImage: "arrow.triangle.2.circlepath")
                    }
                    .buttonStyle(SecondaryButtonStyle())
                    .disabled(store.isLoading)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var heroSummary: String {
        if store.dueThisWeekCount == 0 {
            return "You’re all caught up this week. Great work!"
        }
        let noun = store.dueThisWeekCount == 1 ? "assignment" : "assignments"
        let urgent = store.urgentCount > 0 ? " — \(store.urgentCount) urgent" : ""
        return "You have \(store.dueThisWeekCount) \(noun) due this week\(urgent)."
    }

    private var metrics: some View {
        LazyVGrid(columns: columns, spacing: 12) {
            MetricCard(
                icon: "clock.fill",
                label: "Due this week",
                value: "\(store.dueThisWeekCount)",
                detail: store.urgentCount > 0 ? "\(store.urgentCount) within 48h" : "No urgent deadlines",
                color: store.urgentCount > 0 ? SmartlearnTheme.orange : SmartlearnTheme.primary
            )
            MetricCard(
                icon: "flame.fill",
                label: "Study streak",
                value: "6 days",
                detail: "Keep the momentum",
                color: SmartlearnTheme.secondary
            )
            MetricCard(
                icon: "book.closed.fill",
                label: "Focus this week",
                value: "4.5 hrs",
                detail: "3 sessions completed",
                color: SmartlearnTheme.primary
            )
            MetricCard(
                icon: "graduationcap.fill",
                label: "Content indexed",
                value: "\(store.notes.count)",
                detail: "Ready for grounded study",
                color: SmartlearnTheme.mint
            )
        }
    }

    private var dueThisWeek: some View {
        SurfaceCard {
            VStack(alignment: .leading, spacing: 14) {
                SectionHeading(
                    title: "Due this week",
                    subtitle: "\(store.dueThisWeekCount) coming up",
                    trailingTitle: "View all"
                ) {
                    store.selectedTab = .assignments
                }

                if store.upcomingAssignments.isEmpty {
                    VStack(spacing: 10) {
                        Image(systemName: "checkmark.circle")
                            .font(.title)
                            .foregroundStyle(SmartlearnTheme.primary)
                        Text("Nothing due soon — you’re ahead of the game.")
                            .font(.subheadline)
                            .foregroundStyle(SmartlearnTheme.textSecondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 20)
                } else {
                    ForEach(Array(store.upcomingAssignments.prefix(4))) { assignment in
                        DashboardAssignmentRow(assignment: assignment)
                    }
                }
            }
        }
    }

    private var quickActions: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("QUICK ACTIONS")
                .font(.caption2.weight(.bold))
                .tracking(1.3)
                .foregroundStyle(SmartlearnTheme.textSecondary)

            LazyVGrid(columns: columns, spacing: 12) {
                QuickActionCard(
                    icon: "target",
                    title: "Practice Test",
                    subtitle: "AI quiz on any topic",
                    color: SmartlearnTheme.primary
                ) {
                    store.selectedTab = .practice
                }
                QuickActionCard(
                    icon: "rectangle.on.rectangle.angled",
                    title: "Flashcards",
                    subtitle: "Spaced repetition study",
                    color: SmartlearnTheme.secondary
                ) {
                    store.selectedTab = .flashcards
                }
                QuickActionCard(
                    icon: "book.closed",
                    title: "Study Guide",
                    subtitle: "Review your course notes",
                    color: SmartlearnTheme.mint
                ) {
                    store.selectedTab = .more
                }
                QuickActionCard(
                    icon: "bubble.left.and.bubble.right",
                    title: "Ask Smartlearn",
                    subtitle: "Chat with your AI tutor",
                    color: SmartlearnTheme.orange
                ) {
                    store.selectedTab = .more
                }
            }
        }
    }

    private var recommendations: some View {
        SurfaceCard {
            VStack(alignment: .leading, spacing: 14) {
                SectionHeading(
                    title: "What to study next",
                    subtitle: "Ranked by impact and your mastery gaps",
                    trailingTitle: "Practice"
                ) {
                    store.selectedTab = .practice
                }

                ForEach(Array(store.recommendations.prefix(3).enumerated()), id: \.element.id) { index, item in
                    HStack(alignment: .top, spacing: 12) {
                        Text("\(index + 1)")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(SmartlearnTheme.primary)
                            .frame(width: 25, height: 25)
                            .background(SmartlearnTheme.primary.opacity(0.13), in: RoundedRectangle(cornerRadius: 7))

                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.topic)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(SmartlearnTheme.textPrimary)
                            Text(item.courseName)
                                .font(.caption)
                                .foregroundStyle(SmartlearnTheme.textSecondary)
                            Text(item.reason)
                                .font(.caption)
                                .foregroundStyle(SmartlearnTheme.textSecondary.opacity(0.82))
                                .lineLimit(2)
                        }
                        Spacer(minLength: 4)
                        if let accuracy = item.accuracy {
                            Text("\(accuracy)%")
                                .font(.subheadline.weight(.bold))
                                .foregroundStyle(accuracy < 65 ? SmartlearnTheme.orange : SmartlearnTheme.primary)
                        } else {
                            Text("New")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(SmartlearnTheme.textSecondary)
                        }
                    }
                    .padding(12)
                    .background(Color.white.opacity(0.035), in: RoundedRectangle(cornerRadius: 14))
                }
            }
        }
    }

    private var connectionStatus: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(store.useDemoData ? SmartlearnTheme.orange : SmartlearnTheme.mint)
                .frame(width: 7, height: 7)
            Text(store.useDemoData ? "Demo data · connect your server in Settings" : "Connected to \(store.serverAddress)")
                .font(.caption)
                .foregroundStyle(SmartlearnTheme.textSecondary)
                .lineLimit(1)
            Spacer()
        }
        .padding(.horizontal, 4)
    }

    private func errorBanner(_ message: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(SmartlearnTheme.orange)
            Text(message)
                .font(.caption)
                .foregroundStyle(SmartlearnTheme.textPrimary)
            Spacer()
        }
        .padding(14)
        .background(SmartlearnTheme.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 14))
        .overlay {
            RoundedRectangle(cornerRadius: 14)
                .stroke(SmartlearnTheme.orange.opacity(0.25))
        }
    }
}

private struct MetricCard: View {
    let icon: String
    let label: String
    let value: String
    let detail: String
    let color: Color

    var body: some View {
        SurfaceCard {
            VStack(alignment: .leading, spacing: 9) {
                HStack {
                    Image(systemName: icon)
                        .foregroundStyle(color)
                    Spacer()
                    Circle()
                        .fill(color.opacity(0.9))
                        .frame(width: 5, height: 5)
                }
                Text(value)
                    .font(.title3.weight(.bold))
                    .foregroundStyle(SmartlearnTheme.textPrimary)
                Text(label)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(SmartlearnTheme.textSecondary)
                Text(detail)
                    .font(.caption2)
                    .foregroundStyle(color.opacity(0.9))
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct DashboardAssignmentRow: View {
    let assignment: Assignment

    var body: some View {
        HStack(spacing: 12) {
            VStack(spacing: 1) {
                Text(assignment.dueDate?.formatted(.dateTime.month(.abbreviated)) ?? "—")
                    .font(.caption2.weight(.bold))
                    .textCase(.uppercase)
                Text(assignment.dueDate?.formatted(.dateTime.day()) ?? "")
                    .font(.headline)
            }
            .foregroundStyle(assignment.urgency == .today ? SmartlearnTheme.orange : SmartlearnTheme.primary)
            .frame(width: 48, height: 48)
            .background(
                (assignment.urgency == .today ? SmartlearnTheme.orange : SmartlearnTheme.primary).opacity(0.11),
                in: RoundedRectangle(cornerRadius: 12)
            )

            VStack(alignment: .leading, spacing: 3) {
                Text(assignment.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(SmartlearnTheme.textPrimary)
                    .lineLimit(1)
                Text(assignment.courseName)
                    .font(.caption)
                    .foregroundStyle(SmartlearnTheme.textSecondary)
            }
            Spacer()
            StatusPill(
                title: assignment.urgency.rawValue,
                color: assignment.urgency == .today ? SmartlearnTheme.orange : SmartlearnTheme.textSecondary
            )
        }
        .padding(12)
        .background(Color.white.opacity(0.035), in: RoundedRectangle(cornerRadius: 14))
    }
}

private struct QuickActionCard: View {
    let icon: String
    let title: String
    let subtitle: String
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 11) {
                Image(systemName: icon)
                    .font(.headline)
                    .foregroundStyle(color)
                    .frame(width: 38, height: 38)
                    .background(color.opacity(0.11), in: RoundedRectangle(cornerRadius: 11))
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(SmartlearnTheme.textPrimary)
                    Text(subtitle)
                        .font(.caption2)
                        .foregroundStyle(SmartlearnTheme.textSecondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .padding(13)
            .frame(maxWidth: .infinity)
            .background(SmartlearnTheme.surface.opacity(0.9), in: RoundedRectangle(cornerRadius: 16))
            .overlay {
                RoundedRectangle(cornerRadius: 16)
                    .stroke(SmartlearnTheme.border)
            }
        }
        .buttonStyle(.plain)
    }
}
