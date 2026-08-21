import SwiftUI

struct RootView: View {
    @EnvironmentObject private var store: AppStore

    var body: some View {
        ZStack {
            SmartlearnBackground()
            TabView(selection: $store.selectedTab) {
                DashboardView()
                    .tag(AppTab.home)
                    .tabItem {
                        Label("Home", systemImage: "rectangle.grid.2x2.fill")
                    }

                AssignmentsView()
                    .tag(AppTab.assignments)
                    .tabItem {
                        Label("Assignments", systemImage: "checklist")
                    }

                PracticeView()
                    .tag(AppTab.practice)
                    .tabItem {
                        Label("Practice", systemImage: "figure.strengthtraining.traditional")
                    }

                FlashcardsView()
                    .tag(AppTab.flashcards)
                    .tabItem {
                        Label("Flashcards", systemImage: "rectangle.on.rectangle.angled")
                    }

                MoreView()
                    .tag(AppTab.more)
                    .tabItem {
                        Label("More", systemImage: "square.grid.2x2")
                    }
            }
            .tint(SmartlearnTheme.primary)
        }
        .task {
            if !store.useDemoData {
                await store.refresh()
            }
        }
    }
}
