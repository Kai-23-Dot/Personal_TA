# PersonalTA.ai — Setup & Deployment Guide

## 1. REPO STRUCTURE

```
personal-ta/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx            ← Login page (email + Google OAuth)
│   │   ├── signup/page.tsx           ← Signup page
│   │   └── callback/route.ts         ← Supabase OAuth callback
│   ├── (dashboard)/
│   │   ├── layout.tsx                ← Dashboard shell (auth guard + Sidebar)
│   │   ├── dashboard/page.tsx        ← Main dashboard (stats, plan, deadlines)
│   │   ├── notes/page.tsx            ← Notes upload + AI summary split view
│   │   ├── planner/page.tsx          ← Weekly calendar + AI study plan
│   │   ├── chat/page.tsx             ← TA Chat with streaming + tool calls
│   │   ├── practice/page.tsx         ← Adaptive quiz sessions
│   │   └── settings/page.tsx         ← Profile + LMS integrations
│   ├── api/
│   │   ├── chat/route.ts             ← Streaming Claude agent endpoint
│   │   ├── notes/
│   │   │   ├── upload/route.ts       ← PDF/DOCX/TXT upload + extraction
│   │   │   └── summarize/route.ts    ← AI summary generation
│   │   ├── lms/
│   │   │   ├── google/route.ts       ← Google Classroom OAuth
│   │   │   ├── canvas/route.ts       ← Canvas LMS OAuth
│   │   │   └── microsoft/route.ts    ← Microsoft Teams OAuth
│   │   ├── planner/generate/route.ts ← AI study plan generation
│   │   ├── practice/generate/route.ts← Quiz generation + session tracking
│   │   └── sync/route.ts             ← LMS sync (user + cron)
│   ├── layout.tsx                    ← Root layout (ThemeProvider, Toaster)
│   ├── page.tsx                      ← Landing page
│   └── globals.css                   ← Tailwind + CSS variables
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx               ← Navigation sidebar
│   │   └── Header.tsx                ← Page header with theme toggle
│   ├── providers/
│   │   └── ThemeProvider.tsx         ← next-themes wrapper
│   └── ui/                           ← shadcn/ui components
│       ├── avatar.tsx
│       ├── badge.tsx
│       ├── button.tsx
│       ├── card.tsx
│       ├── input.tsx
│       ├── label.tsx
│       ├── progress.tsx
│       ├── scroll-area.tsx
│       ├── select.tsx
│       ├── separator.tsx
│       ├── switch.tsx
│       ├── tabs.tsx
│       └── textarea.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts                 ← Browser Supabase client
│   │   └── server.ts                 ← Server + service role clients
│   ├── ai/
│   │   ├── agent.ts                  ← LangGraph-style agent (Vercel AI SDK + tools)
│   │   ├── summarizeNotes.ts         ← Note summarization pipeline
│   │   ├── studyPlanner.ts           ← AI study plan generator
│   │   └── generateQuiz.ts           ← Adaptive quiz generator
│   ├── lms/
│   │   ├── google-classroom.ts       ← Google Classroom API calls
│   │   ├── canvas.ts                 ← Canvas REST API calls
│   │   └── microsoft-teams.ts        ← Microsoft Graph Education API calls
│   ├── utils/
│   │   ├── embeddings.ts             ← Voyage AI embedding generation
│   │   ├── rag.ts                    ← pgvector similarity search
│   │   └── utils.ts                  ← cn() utility
│   └── utils.ts                      ← cn() (root)
├── types/
│   └── index.ts                      ← All TypeScript types
├── supabase/
│   ├── migrations/
│   │   └── 001_initial.sql           ← Full DB schema with pgvector
│   └── config.toml                   ← Local Supabase config
├── middleware.ts                      ← Auth middleware (route protection)
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── vercel.json                        ← Cron + function config
├── .env.example                       ← All required env vars
└── package.json
```

---

## 2. ENVIRONMENT VARIABLES

Copy `.env.example` → `.env.local` and fill in:

| Variable | Where to get it | Required |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API | ✅ |
| `ANTHROPIC_API_KEY` | console.anthropic.com/account/keys | ✅ |
| `VOYAGE_API_KEY` | dash.voyageai.com | ✅ (embeddings/RAG) |
| `GOOGLE_CLIENT_ID` | Google Cloud Console → Credentials | For Google Classroom |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console → Credentials | For Google Classroom |
| `CANVAS_CLIENT_ID` | School Canvas admin → Developer Keys | For Canvas LMS |
| `CANVAS_CLIENT_SECRET` | School Canvas admin → Developer Keys | For Canvas LMS |
| `MICROSOFT_CLIENT_ID` | Azure Portal → App Registrations | For MS Teams |
| `MICROSOFT_CLIENT_SECRET` | Azure Portal → App Registrations | For MS Teams |
| `MICROSOFT_TENANT_ID` | Azure Portal (use `common` for multi-tenant) | For MS Teams |
| `NEXT_PUBLIC_APP_URL` | Your Vercel URL | ✅ |
| `CRON_SECRET` | Any random string | For sync cron |

---

## 3. SUPABASE SETUP

### 3a. Create Supabase project

1. Go to https://app.supabase.com and create a new project.
2. Choose a region close to your users.
3. Copy your Project URL and keys to `.env.local`.

### 3b. Run migrations

**Option A — Supabase SQL Editor (easiest):**
1. Open Supabase Dashboard → SQL Editor.
2. Paste the contents of `supabase/migrations/001_initial.sql`.
3. Click **Run**.

**Option B — Supabase CLI:**
```bash
npx supabase login
npx supabase link --project-ref your-project-ref
npx supabase db push
```

### 3c. Enable pgvector

The migration enables it automatically via:
```sql
CREATE EXTENSION IF NOT EXISTS "vector";
```
This requires Supabase's built-in pgvector support (available on all plans).

### 3d. Enable Google Auth (for Supabase login)

In Supabase Dashboard → Authentication → Providers → Google:
- Enable Google provider
- Add your Google Client ID and Secret
- Set Redirect URL to `https://your-project.supabase.co/auth/v1/callback`

### 3e. Create Storage bucket

In Supabase Dashboard → Storage → Create bucket:
- Name: `notes`
- Public: **No** (private, accessed via service role)
- File size limit: 50 MB

---

## 4. OAUTH APP SETUP

### Google Classroom / Drive

1. Go to https://console.cloud.google.com
2. Create a new project (or use existing).
3. Enable APIs:
   - Google Classroom API
   - Google Drive API
   - Google People API
4. Create OAuth 2.0 credentials (Web application):
   - Authorized redirect URI: `https://your-app.vercel.app/api/lms/google`
   - For local dev: `http://localhost:3000/api/lms/google`
5. Copy Client ID and Secret to `.env.local`.

### Canvas LMS

1. Contact your school's Canvas/IT administrator.
2. Ask them to create a **Developer Key** for your app.
3. Redirect URI: `https://your-app.vercel.app/api/lms/canvas`
4. You'll receive a Client ID and Secret.

> Note: Canvas OAuth is per-institution. Students must enter their school's Canvas domain (e.g., `myschool.instructure.com`) in Settings.

### Microsoft Teams Education

1. Go to https://portal.azure.com
2. Azure Active Directory → App registrations → New registration
3. Redirect URI: `https://your-app.vercel.app/api/lms/microsoft`
4. Under API permissions, add:
   - `EduAssignments.ReadBasic`
   - `EduRoster.ReadBasic`
   - `Calendars.Read`
   - `offline_access`
   - `openid`, `profile`, `email`
5. Create a client secret and copy credentials.

---

## 5. LOCAL DEVELOPMENT

```bash
# 1. Install dependencies
pnpm install
# or: npm install

# 2. Copy env vars
cp .env.example .env.local
# Edit .env.local with your actual values

# 3. Start local Supabase (optional — can use cloud Supabase instead)
npx supabase start

# 4. Run migrations against cloud Supabase (if not using local)
# Paste 001_initial.sql in Supabase SQL Editor

# 5. Start the dev server
pnpm dev

# App available at: http://localhost:3000
```

---

## 6. VERCEL DEPLOYMENT

```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Deploy
vercel

# 3. Set environment variables in Vercel dashboard:
#    vercel.com/your-team/your-project/settings/environment-variables
#    Add all variables from .env.example

# 4. Redeploy after setting env vars
vercel --prod
```

### Connect Supabase to Vercel (recommended)

1. In Vercel dashboard → Integrations → Supabase.
2. Connect your Supabase project.
3. Vercel auto-injects `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.

### Cron Jobs

`vercel.json` configures `/api/sync` to run every 6 hours:
```json
{ "crons": [{ "path": "/api/sync", "schedule": "0 */6 * * *" }] }
```
The cron call includes `x-cron-secret` header which must match `CRON_SECRET` env var.

---

## 7. NEXT STEPS / TODO

- **OCR for handwritten notes**: Integrate Google Vision API or AWS Textract to extract text from photos of handwritten notes.
- **Audio lecture ingestion**: Add Whisper (OpenAI) transcription for recorded lectures — upload `.mp3`/`.m4a` → auto-transcribe → summarize.
- **Flashcard generation**: Add a `/flashcards` page that generates Anki-style flashcards from note summaries using Claude.
- **Grade prediction & GPA tracking**: Parse submission grades and plot GPA trends over the semester using Recharts.
- **Collaborative study groups**: Allow students to share note summaries and study plans with classmates using Supabase Realtime.
