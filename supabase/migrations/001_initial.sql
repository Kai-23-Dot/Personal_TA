-- ============================================================
-- PersonalTA.ai — Initial Schema
-- Run this in Supabase SQL Editor or via: supabase db push
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- PROFILES (extends Supabase auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  full_name     TEXT,
  avatar_url    TEXT,
  grade_level   SMALLINT CHECK (grade_level BETWEEN 9 AND 12),
  school_name   TEXT,
  timezone      TEXT DEFAULT 'America/New_York',
  preferences   JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Trigger: auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'avatar_url'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- LMS CONNECTIONS (OAuth tokens per platform)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lms_connections (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform        TEXT NOT NULL CHECK (platform IN ('google_classroom', 'canvas', 'microsoft_teams')),
  access_token    TEXT NOT NULL,
  refresh_token   TEXT,
  token_expires_at TIMESTAMPTZ,
  platform_user_id TEXT,
  platform_email  TEXT,
  scopes          TEXT[],
  canvas_domain   TEXT, -- e.g. "school.instructure.com" for Canvas
  last_synced_at  TIMESTAMPTZ,
  is_active       BOOLEAN DEFAULT TRUE,
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, platform)
);

ALTER TABLE public.lms_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own lms_connections" ON public.lms_connections
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- COURSES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.courses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  connection_id   UUID REFERENCES public.lms_connections(id) ON DELETE SET NULL,
  platform        TEXT NOT NULL CHECK (platform IN ('google_classroom', 'canvas', 'microsoft_teams', 'manual')),
  platform_id     TEXT, -- ID in the LMS platform
  name            TEXT NOT NULL,
  section         TEXT,
  description     TEXT,
  teacher_name    TEXT,
  teacher_email   TEXT,
  color           TEXT DEFAULT '#6366f1', -- for UI display
  is_active       BOOLEAN DEFAULT TRUE,
  academic_year   TEXT,
  semester        TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, platform, platform_id)
);

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own courses" ON public.courses
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_courses_user_id ON public.courses(user_id);

-- ============================================================
-- ASSIGNMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.assignments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id       UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  platform_id     TEXT,
  title           TEXT NOT NULL,
  description     TEXT,
  assignment_type TEXT CHECK (assignment_type IN ('homework', 'quiz', 'test', 'exam', 'project', 'lab', 'essay', 'other')) DEFAULT 'homework',
  due_date        TIMESTAMPTZ,
  available_from  TIMESTAMPTZ,
  points_possible NUMERIC(10, 2),
  weight          NUMERIC(5, 2), -- percentage weight in grade
  is_completed    BOOLEAN DEFAULT FALSE,
  completed_at    TIMESTAMPTZ,
  estimated_minutes INTEGER, -- AI-estimated time to complete
  url             TEXT, -- link to assignment in LMS
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own assignments" ON public.assignments
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_assignments_user_id ON public.assignments(user_id);
CREATE INDEX idx_assignments_course_id ON public.assignments(course_id);
CREATE INDEX idx_assignments_due_date ON public.assignments(due_date);

-- ============================================================
-- SUBMISSIONS & GRADE EVENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.submissions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assignment_id   UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  platform_id     TEXT,
  submitted_at    TIMESTAMPTZ,
  points_earned   NUMERIC(10, 2),
  grade           TEXT, -- letter grade or raw string from LMS
  feedback        TEXT,
  is_late         BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own submissions" ON public.submissions
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.grade_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id       UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  submission_id   UUID REFERENCES public.submissions(id) ON DELETE SET NULL,
  event_type      TEXT NOT NULL CHECK (event_type IN ('grade_received', 'grade_updated', 'extra_credit')),
  points_earned   NUMERIC(10, 2),
  points_possible NUMERIC(10, 2),
  occurred_at     TIMESTAMPTZ DEFAULT NOW(),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.grade_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own grade_events" ON public.grade_events
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- NOTES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id       UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  content         TEXT, -- raw extracted text
  source_type     TEXT NOT NULL CHECK (source_type IN ('upload', 'google_drive', 'onedrive', 'manual')),
  source_url      TEXT, -- original Drive/OneDrive URL
  source_file_id  TEXT, -- platform file ID for re-sync
  file_name       TEXT,
  file_type       TEXT CHECK (file_type IN ('pdf', 'docx', 'txt', 'md', 'image', 'other')),
  file_size_bytes BIGINT,
  storage_path    TEXT, -- Supabase storage path if uploaded
  topic_tags      TEXT[] DEFAULT '{}',
  embedding       vector(1536), -- OpenAI/Anthropic embedding
  is_processed    BOOLEAN DEFAULT FALSE,
  word_count      INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own notes" ON public.notes
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_notes_user_id ON public.notes(user_id);
CREATE INDEX idx_notes_course_id ON public.notes(course_id);
CREATE INDEX idx_notes_embedding ON public.notes USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================
-- NOTE SUMMARIES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.note_summaries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note_id         UUID REFERENCES public.notes(id) ON DELETE CASCADE,
  course_id       UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  summary_type    TEXT NOT NULL CHECK (summary_type IN ('bullet_points', 'outline', 'detailed', 'unit_aggregate')),
  content         TEXT NOT NULL, -- markdown formatted summary
  key_concepts    TEXT[] DEFAULT '{}',
  embedding       vector(1536),
  custom_instruction TEXT,
  model_used      TEXT DEFAULT 'claude-sonnet-4-6',
  tokens_used     INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.note_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own note_summaries" ON public.note_summaries
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_summaries_user_id ON public.note_summaries(user_id);
CREATE INDEX idx_summaries_note_id ON public.note_summaries(note_id);
CREATE INDEX idx_summaries_embedding ON public.note_summaries USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================
-- STUDY PLANS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.study_plans (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_date       DATE NOT NULL,
  status          TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  tasks           JSONB DEFAULT '[]'::jsonb, -- array of StudyTask objects
  total_minutes   INTEGER DEFAULT 0,
  completed_minutes INTEGER DEFAULT 0,
  generated_by    TEXT DEFAULT 'ai' CHECK (generated_by IN ('ai', 'manual')),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, plan_date)
);

ALTER TABLE public.study_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own study_plans" ON public.study_plans
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_study_plans_user_date ON public.study_plans(user_id, plan_date);

-- ============================================================
-- PRACTICE SESSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.practice_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id       UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  topic           TEXT NOT NULL,
  difficulty      TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard', 'adaptive')),
  question_count  INTEGER DEFAULT 0,
  correct_count   INTEGER DEFAULT 0,
  questions       JSONB DEFAULT '[]'::jsonb, -- array of Question objects
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  duration_seconds INTEGER,
  status          TEXT DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.practice_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own practice_sessions" ON public.practice_sessions
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_practice_sessions_user_id ON public.practice_sessions(user_id);

-- ============================================================
-- PERFORMANCE METRICS (aggregated weak area tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.performance_metrics (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id       UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  topic           TEXT NOT NULL,
  subtopic        TEXT,
  attempts        INTEGER DEFAULT 0,
  correct         INTEGER DEFAULT 0,
  accuracy_pct    NUMERIC(5, 2) DEFAULT 0,
  last_practiced  TIMESTAMPTZ,
  mastery_level   TEXT DEFAULT 'unknown' CHECK (mastery_level IN ('unknown', 'learning', 'practicing', 'mastered')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Unique index allows COALESCE on nullable subtopic
CREATE UNIQUE INDEX idx_perf_metrics_unique ON public.performance_metrics(user_id, topic, COALESCE(subtopic, ''));

ALTER TABLE public.performance_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own performance_metrics" ON public.performance_metrics
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_perf_metrics_user_id ON public.performance_metrics(user_id);
CREATE INDEX idx_perf_metrics_accuracy ON public.performance_metrics(user_id, accuracy_pct);

-- ============================================================
-- CHAT MESSAGES (persisted conversation history)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id      UUID NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content         TEXT NOT NULL,
  tool_name       TEXT,
  tool_call_id    TEXT,
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own chat_messages" ON public.chat_messages
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_chat_messages_session ON public.chat_messages(session_id, created_at);
CREATE INDEX idx_chat_messages_user_id ON public.chat_messages(user_id);

-- ============================================================
-- RAG: Vector similarity search helper function
-- ============================================================
CREATE OR REPLACE FUNCTION match_notes(
  query_embedding vector(1536),
  match_user_id   UUID,
  match_count     INT DEFAULT 5,
  similarity_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id          UUID,
  title       TEXT,
  content     TEXT,
  course_id   UUID,
  similarity  FLOAT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.id,
    n.title,
    n.content,
    n.course_id,
    1 - (n.embedding <=> query_embedding) AS similarity
  FROM public.notes n
  WHERE n.user_id = match_user_id
    AND n.embedding IS NOT NULL
    AND 1 - (n.embedding <=> query_embedding) > similarity_threshold
  ORDER BY n.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION match_summaries(
  query_embedding vector(1536),
  match_user_id   UUID,
  match_count     INT DEFAULT 5,
  similarity_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id          UUID,
  content     TEXT,
  note_id     UUID,
  course_id   UUID,
  similarity  FLOAT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.content,
    s.note_id,
    s.course_id,
    1 - (s.embedding <=> query_embedding) AS similarity
  FROM public.note_summaries s
  WHERE s.user_id = match_user_id
    AND s.embedding IS NOT NULL
    AND 1 - (s.embedding <=> query_embedding) > similarity_threshold
  ORDER BY s.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================
-- updated_at trigger helper
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_lms_connections_updated_at BEFORE UPDATE ON public.lms_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_courses_updated_at BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_assignments_updated_at BEFORE UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_notes_updated_at BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_note_summaries_updated_at BEFORE UPDATE ON public.note_summaries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_study_plans_updated_at BEFORE UPDATE ON public.study_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_perf_metrics_updated_at BEFORE UPDATE ON public.performance_metrics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
