import Combine
import SwiftUI

struct FlashcardsView: View {
    @EnvironmentObject private var store: AppStore
    @State private var currentIndex = 0
    @State private var isFlipped = false
    @State private var reviewedCount = 0

    var body: some View {
        NavigationStack {
            ZStack {
                ConlearnBackground()
                if store.flashcards.isEmpty {
                    ContentUnavailableView(
                        "No flashcards yet",
                        systemImage: "rectangle.on.rectangle.angled",
                        description: Text("Generate a set from a course or note to begin.")
                    )
                } else {
                    VStack(spacing: 20) {
                        header
                        flashcard
                        controls
                        Spacer()
                    }
                    .padding(16)
                }
            }
            .navigationTitle("Flashcards")
            .conlearnNavigationStyle()
        }
    }

    private var card: Flashcard {
        store.flashcards[min(currentIndex, store.flashcards.count - 1)]
    }

    private var header: some View {
        VStack(spacing: 9) {
            HStack {
                Text(card.courseName)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(ConlearnTheme.primary)
                Spacer()
                Text("\(currentIndex + 1) / \(store.flashcards.count)")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(ConlearnTheme.textSecondary)
            }
            ProgressView(value: Double(currentIndex + 1), total: Double(store.flashcards.count))
                .tint(ConlearnTheme.primary)
        }
    }

    private var flashcard: some View {
        Button {
            withAnimation(.spring(response: 0.45, dampingFraction: 0.82)) {
                isFlipped.toggle()
            }
        } label: {
            VStack(spacing: 18) {
                Image(systemName: isFlipped ? "text.book.closed.fill" : "questionmark.bubble.fill")
                    .font(.title)
                    .foregroundStyle(isFlipped ? ConlearnTheme.mint : ConlearnTheme.primary)
                Text(isFlipped ? "ANSWER" : "QUESTION")
                    .font(.caption2.weight(.bold))
                    .tracking(1.5)
                    .foregroundStyle(ConlearnTheme.textSecondary)
                Text(isFlipped ? card.back : card.front)
                    .font(.title2.weight(.semibold))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(ConlearnTheme.textPrimary)
                Text("Tap to \(isFlipped ? "see the question" : "reveal the answer")")
                    .font(.caption)
                    .foregroundStyle(ConlearnTheme.textSecondary)
            }
            .padding(26)
            .frame(maxWidth: .infinity, minHeight: 330)
            .background(
                LinearGradient(
                    colors: [
                        ConlearnTheme.surface,
                        (isFlipped ? ConlearnTheme.mint : ConlearnTheme.primary).opacity(0.08)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                in: RoundedRectangle(cornerRadius: 26, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .stroke((isFlipped ? ConlearnTheme.mint : ConlearnTheme.primary).opacity(0.24))
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isFlipped ? "Answer: \(card.back)" : "Question: \(card.front)")
    }

    private var controls: some View {
        HStack(spacing: 12) {
            Button {
                advance()
            } label: {
                Label("Review again", systemImage: "arrow.counterclockwise")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(SecondaryButtonStyle())

            Button {
                reviewedCount += 1
                advance()
            } label: {
                Label("Got it", systemImage: "checkmark")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(PrimaryButtonStyle())
        }
    }

    private func advance() {
        withAnimation(.easeInOut(duration: 0.2)) {
            currentIndex = (currentIndex + 1) % store.flashcards.count
            isFlipped = false
        }
    }
}

struct MoreView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 12) {
                    NavigationLink { CoursesView() } label: {
                        MoreItemRow(icon: "books.vertical.fill", title: "Courses", subtitle: "Synced classes and materials", color: ConlearnTheme.primary)
                    }
                    NavigationLink { StudyPlanView() } label: {
                        MoreItemRow(icon: "brain.head.profile.fill", title: "Study", subtitle: "Personal priorities and plan", color: ConlearnTheme.secondary)
                    }
                    NavigationLink { NotesView() } label: {
                        MoreItemRow(icon: "book.closed.fill", title: "Notes", subtitle: "Course notes and AI summaries", color: ConlearnTheme.mint)
                    }
                    NavigationLink {
                        FeatureStarterView(
                            title: "Review",
                            icon: "arrow.counterclockwise.circle.fill",
                            message: "A home for spaced review, missed questions, and mastery checks."
                        )
                    } label: {
                        MoreItemRow(icon: "arrow.counterclockwise.circle.fill", title: "Review", subtitle: "Revisit missed concepts", color: ConlearnTheme.orange)
                    }
                    NavigationLink { FocusView() } label: {
                        MoreItemRow(icon: "timer", title: "Focus", subtitle: "Distraction-free study timer", color: ConlearnTheme.primary)
                    }
                    NavigationLink { GradesView() } label: {
                        MoreItemRow(icon: "chart.bar.fill", title: "Grades", subtitle: "Performance and trends", color: ConlearnTheme.mint)
                    }
                    NavigationLink { GroupsView() } label: {
                        MoreItemRow(icon: "person.3.fill", title: "Groups", subtitle: "Shared goals and study sessions", color: ConlearnTheme.secondary)
                    }
                    NavigationLink {
                        FeatureStarterView(
                            title: "Ask Conlearn",
                            icon: "bubble.left.and.bubble.right.fill",
                            message: "Connect the existing chat endpoint here for a native, course-aware AI tutor."
                        )
                    } label: {
                        MoreItemRow(icon: "bubble.left.and.bubble.right.fill", title: "Ask Conlearn", subtitle: "Your course-aware AI tutor", color: ConlearnTheme.orange)
                    }
                    NavigationLink { SettingsView() } label: {
                        MoreItemRow(icon: "gearshape.fill", title: "Settings", subtitle: "Backend, account, and preferences", color: ConlearnTheme.textSecondary)
                    }
                }
                .padding(16)
                .padding(.bottom, 24)
            }
            .background(ConlearnBackground())
            .navigationTitle("More")
            .conlearnNavigationStyle()
        }
    }
}

private struct MoreItemRow: View {
    let icon: String
    let title: String
    let subtitle: String
    let color: Color

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.headline)
                .foregroundStyle(color)
                .frame(width: 42, height: 42)
                .background(color.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(ConlearnTheme.textPrimary)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(ConlearnTheme.textSecondary)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption.weight(.bold))
                .foregroundStyle(ConlearnTheme.textSecondary)
        }
        .padding(14)
        .background(ConlearnTheme.surface.opacity(0.92), in: RoundedRectangle(cornerRadius: 16))
        .overlay {
            RoundedRectangle(cornerRadius: 16).stroke(ConlearnTheme.border)
        }
    }
}

struct CoursesView: View {
    @EnvironmentObject private var store: AppStore
    private let columns = [GridItem(.adaptive(minimum: 160), spacing: 12)]

    var body: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(store.courses) { course in
                    let count = store.assignments.filter { $0.courseID == course.id }.count
                    let upcoming = store.assignments.filter { $0.courseID == course.id && !$0.isCompleted }.count
                    SurfaceCard {
                        VStack(alignment: .leading, spacing: 12) {
                            HStack {
                                Text(course.initials)
                                    .font(.headline.weight(.bold))
                                    .foregroundStyle(ConlearnTheme.background)
                                    .frame(width: 48, height: 48)
                                    .background(Color(hex: course.color ?? "#8AB4FF"), in: RoundedRectangle(cornerRadius: 14))
                                Spacer()
                                StatusPill(title: (course.platform ?? "Course").capitalized, color: ConlearnTheme.textSecondary)
                            }
                            Text(course.name)
                                .font(.headline)
                                .foregroundStyle(ConlearnTheme.textPrimary)
                                .lineLimit(2)
                            Text([course.section, course.teacherName].compactMap { $0 }.joined(separator: " · "))
                                .font(.caption)
                                .foregroundStyle(ConlearnTheme.textSecondary)
                                .lineLimit(1)
                            HStack {
                                courseMetric("\(count)", "items")
                                Spacer()
                                courseMetric("\(upcoming)", "upcoming")
                            }
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(ConlearnBackground())
        .navigationTitle("Courses")
        .conlearnNavigationStyle()
    }

    private func courseMetric(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.headline)
                .foregroundStyle(ConlearnTheme.textPrimary)
            Text(label)
                .font(.caption2)
                .foregroundStyle(ConlearnTheme.textSecondary)
        }
    }
}

struct NotesView: View {
    @EnvironmentObject private var store: AppStore
    @State private var searchText = ""

    private var filteredNotes: [NoteItem] {
        store.notes.filter {
            searchText.isEmpty ||
            $0.title.localizedCaseInsensitiveContains(searchText) ||
            $0.courseName.localizedCaseInsensitiveContains(searchText)
        }
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(ConlearnTheme.textSecondary)
                    TextField("Search notes", text: $searchText)
                }
                .padding(12)
                .background(ConlearnTheme.surface, in: RoundedRectangle(cornerRadius: 13))
                .overlay {
                    RoundedRectangle(cornerRadius: 13).stroke(ConlearnTheme.border)
                }

                ForEach(filteredNotes) { note in
                    SurfaceCard {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                StatusPill(title: note.courseName, color: ConlearnTheme.mint)
                                Spacer()
                                Text(note.updatedAt.formatted(.relative(presentation: .named)))
                                    .font(.caption2)
                                    .foregroundStyle(ConlearnTheme.textSecondary)
                            }
                            Text(note.title)
                                .font(.headline)
                                .foregroundStyle(ConlearnTheme.textPrimary)
                            Text(note.preview)
                                .font(.subheadline)
                                .foregroundStyle(ConlearnTheme.textSecondary)
                                .lineLimit(3)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
            .padding(16)
        }
        .background(ConlearnBackground())
        .navigationTitle("Notes")
        .conlearnNavigationStyle()
    }
}

struct StudyPlanView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SurfaceCard {
                    VStack(alignment: .leading, spacing: 6) {
                        Label("Today’s plan", systemImage: "sparkles")
                            .font(.headline)
                            .foregroundStyle(ConlearnTheme.primary)
                        Text("A focused 55-minute plan based on upcoming work and mastery gaps.")
                            .font(.subheadline)
                            .foregroundStyle(ConlearnTheme.textSecondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                planBlock(time: "20 min", title: "Chain Rule practice", detail: "AP Calculus AB", color: ConlearnTheme.primary)
                planBlock(time: "25 min", title: "Cellular Respiration review", detail: "Biology 101", color: ConlearnTheme.mint)
                planBlock(time: "10 min", title: "Essay source recall", detail: "World History", color: ConlearnTheme.secondary)

                SectionHeading(title: "Why this order", subtitle: "Priority × urgency × mastery")
                    .padding(.top, 6)
                ForEach(store.recommendations) { recommendation in
                    HStack(alignment: .top, spacing: 10) {
                        Circle()
                            .fill(ConlearnTheme.primary)
                            .frame(width: 6, height: 6)
                            .padding(.top, 5)
                        Text(recommendation.reason)
                            .font(.caption)
                            .foregroundStyle(ConlearnTheme.textSecondary)
                    }
                }
            }
            .padding(16)
        }
        .background(ConlearnBackground())
        .navigationTitle("Study")
        .conlearnNavigationStyle()
    }

    private func planBlock(time: String, title: String, detail: String, color: Color) -> some View {
        SurfaceCard {
            HStack(spacing: 14) {
                Text(time)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(color)
                    .frame(width: 52, height: 52)
                    .background(color.opacity(0.12), in: RoundedRectangle(cornerRadius: 14))
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.headline)
                        .foregroundStyle(ConlearnTheme.textPrimary)
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(ConlearnTheme.textSecondary)
                }
                Spacer()
                Image(systemName: "play.fill")
                    .foregroundStyle(color)
            }
        }
    }
}

struct FocusView: View {
    @State private var duration = 25
    @State private var remaining = 25 * 60
    @State private var isRunning = false
    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        VStack(spacing: 26) {
            Spacer()
            ZStack {
                Circle()
                    .stroke(ConlearnTheme.elevatedSurface, lineWidth: 14)
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(ConlearnTheme.primary, style: StrokeStyle(lineWidth: 14, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                VStack(spacing: 7) {
                    Text(timeString)
                        .font(.system(size: 48, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(ConlearnTheme.textPrimary)
                    Text(isRunning ? "FOCUSING" : "READY")
                        .font(.caption.weight(.bold))
                        .tracking(1.5)
                        .foregroundStyle(ConlearnTheme.textSecondary)
                }
            }
            .frame(width: 250, height: 250)

            Picker("Duration", selection: $duration) {
                Text("25 min").tag(25)
                Text("50 min").tag(50)
            }
            .pickerStyle(.segmented)
            .frame(maxWidth: 260)
            .disabled(isRunning)
            .onChange(of: duration) { _, newValue in
                remaining = newValue * 60
            }

            HStack(spacing: 12) {
                Button(isRunning ? "Pause" : "Start") {
                    isRunning.toggle()
                }
                .buttonStyle(PrimaryButtonStyle())

                Button("Reset") {
                    isRunning = false
                    remaining = duration * 60
                }
                .buttonStyle(SecondaryButtonStyle())
            }
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding(16)
        .background(ConlearnBackground())
        .navigationTitle("Focus")
        .conlearnNavigationStyle()
        .onReceive(timer) { _ in
            guard isRunning, remaining > 0 else { return }
            remaining -= 1
            if remaining == 0 {
                isRunning = false
            }
        }
    }

    private var progress: Double {
        guard duration > 0 else { return 0 }
        return 1 - (Double(remaining) / Double(duration * 60))
    }

    private var timeString: String {
        String(format: "%02d:%02d", remaining / 60, remaining % 60)
    }
}

struct GradesView: View {
    private let grades = [
        ("Biology 101", 92, ConlearnTheme.mint),
        ("AP Calculus AB", 87, ConlearnTheme.primary),
        ("World History", 94, ConlearnTheme.secondary)
    ]

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                SurfaceCard {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Overall average")
                                .font(.caption)
                                .foregroundStyle(ConlearnTheme.textSecondary)
                            Text("91.0%")
                                .font(.largeTitle.weight(.bold))
                                .foregroundStyle(ConlearnTheme.textPrimary)
                        }
                        Spacer()
                        Label("+2.4%", systemImage: "arrow.up.right")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(ConlearnTheme.mint)
                    }
                }

                ForEach(grades, id: \.0) { name, grade, color in
                    SurfaceCard {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Text(name)
                                    .font(.headline)
                                    .foregroundStyle(ConlearnTheme.textPrimary)
                                Spacer()
                                Text("\(grade)%")
                                    .font(.title3.weight(.bold))
                                    .foregroundStyle(color)
                            }
                            ProgressView(value: Double(grade), total: 100)
                                .tint(color)
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(ConlearnBackground())
        .navigationTitle("Grades")
        .conlearnNavigationStyle()
    }
}

struct GroupsView: View {
    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                groupCard(
                    title: "Calculus Exam Prep",
                    members: "4 members",
                    detail: "Next check-in today at 7:00 PM",
                    color: ConlearnTheme.primary
                )
                groupCard(
                    title: "Biology Lab Partners",
                    members: "3 members",
                    detail: "2 shared flashcard sets",
                    color: ConlearnTheme.mint
                )

                Button {
                } label: {
                    Label("Create or join a group", systemImage: "person.badge.plus")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(PrimaryButtonStyle())
            }
            .padding(16)
        }
        .background(ConlearnBackground())
        .navigationTitle("Groups")
        .conlearnNavigationStyle()
    }

    private func groupCard(title: String, members: String, detail: String, color: Color) -> some View {
        SurfaceCard {
            HStack(spacing: 14) {
                Image(systemName: "person.3.fill")
                    .foregroundStyle(color)
                    .frame(width: 48, height: 48)
                    .background(color.opacity(0.12), in: RoundedRectangle(cornerRadius: 14))
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.headline)
                        .foregroundStyle(ConlearnTheme.textPrimary)
                    Text(members)
                        .font(.caption)
                        .foregroundStyle(color)
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(ConlearnTheme.textSecondary)
                }
                Spacer()
            }
        }
    }
}

struct SettingsView: View {
    @EnvironmentObject private var store: AppStore
    @State private var isTesting = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                SurfaceCard {
                    VStack(alignment: .leading, spacing: 14) {
                        Label("Data source", systemImage: "server.rack")
                            .font(.headline)
                            .foregroundStyle(ConlearnTheme.textPrimary)

                        Toggle("Use Demo Data", isOn: $store.useDemoData)
                            .tint(ConlearnTheme.primary)

                        VStack(alignment: .leading, spacing: 7) {
                            Text("CONLEARN SERVER")
                                .font(.caption2.weight(.bold))
                                .tracking(1)
                                .foregroundStyle(ConlearnTheme.textSecondary)
                            TextField("https://your-app.vercel.app", text: $store.serverAddress)
                                .textInputAutocapitalization(.never)
                                .keyboardType(.URL)
                                .autocorrectionDisabled()
                                .padding(12)
                                .background(Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 12))
                                .overlay {
                                    RoundedRectangle(cornerRadius: 12).stroke(ConlearnTheme.border)
                                }
                        }
                        .disabled(store.useDemoData)
                        .opacity(store.useDemoData ? 0.5 : 1)

                        Button {
                            isTesting = true
                            Task {
                                await store.refresh()
                                isTesting = false
                            }
                        } label: {
                            HStack {
                                if isTesting {
                                    ProgressView()
                                        .tint(ConlearnTheme.background)
                                } else {
                                    Image(systemName: "network")
                                }
                                Text(isTesting ? "Testing…" : "Save and test connection")
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(PrimaryButtonStyle())
                        .disabled(store.useDemoData || store.serverAddress.isEmpty || isTesting)

                        if let error = store.errorMessage {
                            Text(error)
                                .font(.caption)
                                .foregroundStyle(ConlearnTheme.orange)
                        }
                    }
                }

                SurfaceCard {
                    VStack(alignment: .leading, spacing: 10) {
                        Label("Authentication handoff", systemImage: "person.badge.key.fill")
                            .font(.headline)
                            .foregroundStyle(ConlearnTheme.textPrimary)
                        Text("The web app currently uses Supabase cookie sessions. Add the Supabase Swift package, complete native sign-in, and attach the access token in APIClient before using production accounts.")
                            .font(.subheadline)
                            .foregroundStyle(ConlearnTheme.textSecondary)
                    }
                }

                SurfaceCard {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Conlearn for iOS")
                            .font(.headline)
                            .foregroundStyle(ConlearnTheme.textPrimary)
                        Text("Starter version 1.0")
                            .font(.caption)
                            .foregroundStyle(ConlearnTheme.textSecondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(16)
        }
        .background(ConlearnBackground())
        .navigationTitle("Settings")
        .conlearnNavigationStyle()
        .onChange(of: store.useDemoData) { _, demoMode in
            if demoMode {
                store.resetDemoData()
            }
        }
    }
}

struct FeatureStarterView: View {
    let title: String
    let icon: String
    let message: String

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: icon)
                .font(.system(size: 50))
                .foregroundStyle(ConlearnTheme.primary)
            Text(title)
                .font(.title.weight(.bold))
                .foregroundStyle(ConlearnTheme.textPrimary)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(ConlearnTheme.textSecondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 360)
            Text("This navigation and visual foundation is ready for the production feature.")
                .font(.caption)
                .foregroundStyle(ConlearnTheme.textSecondary.opacity(0.8))
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(ConlearnBackground())
        .navigationTitle(title)
        .conlearnNavigationStyle()
    }
}
