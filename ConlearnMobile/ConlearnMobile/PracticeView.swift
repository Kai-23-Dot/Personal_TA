import SwiftUI

struct PracticeView: View {
    @EnvironmentObject private var store: AppStore
    @State private var courseID = ""
    @State private var topic = ""
    @State private var difficulty: PracticeDifficulty = .adaptive
    @State private var mode: PracticeMode = .quiz
    @State private var questionCount = 10
    @State private var isGenerating = false
    @State private var showingSession = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    intro

                    SurfaceCard {
                        VStack(alignment: .leading, spacing: 18) {
                            fieldLabel("Course")
                            Picker("Course", selection: $courseID) {
                                Text("Choose a course").tag("")
                                ForEach(store.courses) { course in
                                    Text(course.name).tag(course.id)
                                }
                            }
                            .pickerStyle(.menu)
                            .tint(ConlearnTheme.primary)

                            Divider().overlay(ConlearnTheme.border)

                            fieldLabel("Topic or learning goal")
                            TextField("e.g. cellular respiration", text: $topic, axis: .vertical)
                                .lineLimit(2...4)
                                .padding(12)
                                .background(Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 12))
                                .overlay {
                                    RoundedRectangle(cornerRadius: 12).stroke(ConlearnTheme.border)
                                }

                            fieldLabel("Study mode")
                            Picker("Study mode", selection: $mode) {
                                ForEach(PracticeMode.allCases) { option in
                                    Label(option.rawValue, systemImage: option.icon).tag(option)
                                }
                            }
                            .pickerStyle(.segmented)

                            fieldLabel("Difficulty")
                            Picker("Difficulty", selection: $difficulty) {
                                ForEach(PracticeDifficulty.allCases) { option in
                                    Text(option.rawValue).tag(option)
                                }
                            }
                            .pickerStyle(.menu)
                            .tint(ConlearnTheme.primary)

                            HStack {
                                VStack(alignment: .leading, spacing: 3) {
                                    fieldLabel("Questions")
                                    Text("Choose 5–25 questions")
                                        .font(.caption)
                                        .foregroundStyle(ConlearnTheme.textSecondary)
                                }
                                Spacer()
                                Stepper("\(questionCount)", value: $questionCount, in: 5...25, step: 5)
                                    .labelsHidden()
                                Text("\(questionCount)")
                                    .font(.headline.monospacedDigit())
                                    .frame(width: 30)
                            }
                        }
                    }

                    sourceNote

                    Button {
                        isGenerating = true
                        Task {
                            try? await Task.sleep(for: .milliseconds(650))
                            isGenerating = false
                            showingSession = true
                        }
                    } label: {
                        HStack {
                            if isGenerating {
                                ProgressView()
                                    .tint(ConlearnTheme.background)
                            } else {
                                Image(systemName: "sparkles")
                            }
                            Text(isGenerating ? "Building your session…" : "Generate practice")
                            Spacer()
                            Image(systemName: "arrow.right")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    .disabled(isGenerating)
                }
                .padding(.horizontal, 16)
                .padding(.top, 14)
                .padding(.bottom, 30)
            }
            .background(ConlearnBackground())
            .navigationTitle("Practice")
            .conlearnNavigationStyle()
            .sheet(isPresented: $showingSession) {
                PracticeSessionView(
                    title: effectiveTopic,
                    questions: PracticeQuestion.samples(for: effectiveTopic)
                )
            }
        }
    }

    private var intro: some View {
        SurfaceCard {
            HStack(alignment: .top, spacing: 14) {
                Image(systemName: "target")
                    .font(.title)
                    .foregroundStyle(ConlearnTheme.primary)
                    .frame(width: 52, height: 52)
                    .background(ConlearnTheme.primary.opacity(0.12), in: RoundedRectangle(cornerRadius: 15))
                VStack(alignment: .leading, spacing: 5) {
                    Text("Build a focused study session")
                        .font(.title3.weight(.bold))
                        .foregroundStyle(ConlearnTheme.textPrimary)
                    Text("Use a course, assignment, or topic to generate source-grounded questions.")
                        .font(.subheadline)
                        .foregroundStyle(ConlearnTheme.textSecondary)
                }
            }
        }
    }

    private var sourceNote: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "lock.shield")
                .foregroundStyle(ConlearnTheme.mint)
            Text("When your server is connected, generated material can be grounded in synced course notes and Canvas files.")
                .font(.caption)
                .foregroundStyle(ConlearnTheme.textSecondary)
        }
        .padding(.horizontal, 4)
    }

    private var effectiveTopic: String {
        if !topic.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return topic
        }
        return store.courses.first(where: { $0.id == courseID })?.name ?? "Course practice"
    }

    private func fieldLabel(_ title: String) -> some View {
        Text(title.uppercased())
            .font(.caption2.weight(.bold))
            .tracking(1.1)
            .foregroundStyle(ConlearnTheme.textSecondary)
    }
}

private enum PracticeDifficulty: String, CaseIterable, Identifiable {
    case adaptive = "Adaptive"
    case easy = "Easy"
    case medium = "Medium"
    case hard = "Hard"

    var id: String { rawValue }
}

private enum PracticeMode: String, CaseIterable, Identifiable {
    case quiz = "Quiz"
    case mixed = "Mixed"
    case review = "Review"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .quiz: return "checkmark.square"
        case .mixed: return "shuffle"
        case .review: return "arrow.counterclockwise"
        }
    }
}

private struct PracticeQuestion: Identifiable {
    let id = UUID()
    let prompt: String
    let options: [String]
    let correctIndex: Int
    let explanation: String

    static func samples(for topic: String) -> [PracticeQuestion] {
        [
            PracticeQuestion(
                prompt: "Which statement best captures a core idea in \(topic)?",
                options: [
                    "It connects multiple concepts through a consistent process.",
                    "It can only be understood by memorizing a single definition.",
                    "It has no relationship to prior course material.",
                    "It is never used in applied problems."
                ],
                correctIndex: 0,
                explanation: "Strong understanding comes from recognizing relationships and applying the underlying process."
            ),
            PracticeQuestion(
                prompt: "What is the strongest first step when solving a new \(topic) problem?",
                options: [
                    "Guess an answer immediately.",
                    "Identify what is known, what is asked, and the relevant principle.",
                    "Skip directly to the final formula.",
                    "Ignore units and context."
                ],
                correctIndex: 1,
                explanation: "Separating known information from the goal helps you select the right concept and avoid irrelevant steps."
            ),
            PracticeQuestion(
                prompt: "Which study approach most improves long-term recall?",
                options: [
                    "Rereading once",
                    "Highlighting every sentence",
                    "Active retrieval with spaced review",
                    "Studying only the night before"
                ],
                correctIndex: 2,
                explanation: "Active retrieval and spacing strengthen recall more reliably than passive rereading."
            )
        ]
    }
}

private struct PracticeSessionView: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    let questions: [PracticeQuestion]
    @State private var index = 0
    @State private var selectedAnswer: Int?
    @State private var score = 0

    private var isFinished: Bool { index >= questions.count }

    var body: some View {
        NavigationStack {
            ZStack {
                ConlearnBackground()
                if isFinished {
                    completion
                } else {
                    question
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Close") { dismiss() }
                }
            }
            .conlearnNavigationStyle()
        }
    }

    private var question: some View {
        let current = questions[index]
        return ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    Text("Question \(index + 1) of \(questions.count)")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(ConlearnTheme.textSecondary)
                    Spacer()
                    Text("\(score) correct")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(ConlearnTheme.mint)
                }
                ProgressView(value: Double(index + 1), total: Double(questions.count))
                    .tint(ConlearnTheme.primary)

                SurfaceCard {
                    Text(current.prompt)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(ConlearnTheme.textPrimary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                ForEach(current.options.indices, id: \.self) { optionIndex in
                    Button {
                        guard selectedAnswer == nil else { return }
                        selectedAnswer = optionIndex
                        if optionIndex == current.correctIndex {
                            score += 1
                        }
                    } label: {
                        HStack(spacing: 12) {
                            Text(String(UnicodeScalar(65 + optionIndex)!))
                                .font(.subheadline.weight(.bold))
                                .frame(width: 32, height: 32)
                                .background(optionColor(optionIndex).opacity(0.13), in: Circle())
                            Text(current.options[optionIndex])
                                .font(.subheadline)
                                .multilineTextAlignment(.leading)
                            Spacer()
                        }
                        .foregroundStyle(ConlearnTheme.textPrimary)
                        .padding(14)
                        .background(ConlearnTheme.surface, in: RoundedRectangle(cornerRadius: 15))
                        .overlay {
                            RoundedRectangle(cornerRadius: 15)
                                .stroke(optionColor(optionIndex).opacity(selectedAnswer == nil ? 0.15 : 0.65))
                        }
                    }
                    .buttonStyle(.plain)
                }

                if selectedAnswer != nil {
                    VStack(alignment: .leading, spacing: 8) {
                        Label(
                            selectedAnswer == current.correctIndex ? "Correct" : "Review this one",
                            systemImage: selectedAnswer == current.correctIndex ? "checkmark.circle.fill" : "lightbulb.fill"
                        )
                        .font(.headline)
                        .foregroundStyle(selectedAnswer == current.correctIndex ? ConlearnTheme.mint : ConlearnTheme.orange)
                        Text(current.explanation)
                            .font(.subheadline)
                            .foregroundStyle(ConlearnTheme.textSecondary)
                    }
                    .padding(15)
                    .background(Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 15))

                    Button {
                        index += 1
                        selectedAnswer = nil
                    } label: {
                        HStack {
                            Text(index == questions.count - 1 ? "See results" : "Next question")
                            Spacer()
                            Image(systemName: "arrow.right")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(PrimaryButtonStyle())
                }
            }
            .padding(16)
        }
    }

    private var completion: some View {
        VStack(spacing: 18) {
            Image(systemName: "trophy.fill")
                .font(.system(size: 54))
                .foregroundStyle(ConlearnTheme.orange)
            Text("Session complete")
                .font(.title.weight(.bold))
                .foregroundStyle(ConlearnTheme.textPrimary)
            Text("\(score) of \(questions.count) correct")
                .font(.title3)
                .foregroundStyle(ConlearnTheme.textSecondary)
            Button("Done") { dismiss() }
                .buttonStyle(PrimaryButtonStyle())
        }
        .padding(28)
    }

    private func optionColor(_ optionIndex: Int) -> Color {
        guard let selectedAnswer else { return ConlearnTheme.textSecondary }
        if optionIndex == questions[index].correctIndex {
            return ConlearnTheme.mint
        }
        if optionIndex == selectedAnswer {
            return ConlearnTheme.danger
        }
        return ConlearnTheme.textSecondary
    }
}
