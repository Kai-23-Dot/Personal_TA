# Smartlearn for iOS

A standalone SwiftUI starter for turning the existing Smartlearn web product into a native iPhone and iPad app.

## Open it

1. Open `SmartlearnMobile.xcodeproj` in Xcode.
2. Choose an iPhone simulator.
3. Press Run.

The app starts with realistic demo content so every screen is useful before a backend is connected.

## Connect the existing backend

The app includes a small `APIClient` that already targets the same route shapes used by the web project:

- `GET /api/profile`
- `GET /api/courses`
- `GET /api/assignments`

In the app, open **More → Settings**, enter the deployed HTTPS address of the existing Smartlearn web app, and turn off Demo Mode. Authentication is intentionally left as the next integration step because the current web app uses cookie-backed Supabase sessions. For production, add native Supabase authentication and attach the resulting access token to requests in `APIClient`.

## Starter architecture

- `SmartlearnMobileApp.swift` — app entry point
- `RootView.swift` — tab navigation and launch flow
- `AppStore.swift` — shared state, loading, and demo data
- `APIClient.swift` — async networking boundary
- `Models.swift` — API/domain models
- `Theme.swift` — reusable colors, cards, badges, and buttons
- `DashboardView.swift` — native dashboard
- `AssignmentsView.swift` — assignment filtering and completion
- `PracticeView.swift` — practice-test setup
- `LibraryViews.swift` — courses, flashcards, notes, focus, grades, groups, and settings starters

No files outside this `SmartlearnMobile` folder are required or modified.
