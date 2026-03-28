-- ============================================================
-- PersonalTA.ai — Migration 008: Planner, analytics, focus, rubrics
-- ============================================================

-- Study availability (weekly)
CREATE TABLE IF NOT EXISTS public.study_availability (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day_of_week     SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday
  start_time      TIME NOT NULL,
  end_time        TIME NOT NULL,
  preferred_block_minutes INTEGER DEFAULT 45,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.study_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own study_availability" ON public.study_availability
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_study_availability_user_day ON public.study_availability(user_id, day_of_week);
CREATE TRIGGER set_study_availability_updated_at BEFORE UPDATE ON public.study_availability
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Study blocks (calendar-style schedule)
CREATE TABLE IF NOT EXISTS public.study_blocks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_date       DATE NOT NULL,
  title           TEXT NOT NULL,
  task_type       TEXT DEFAULT 'study' CHECK (task_type IN ('study','homework','review','practice','read','exam')),
  start_time      TIMESTAMPTZ NOT NULL,
  end_time        TIMESTAMPTZ NOT NULL,
  assignment_id   UUID REFERENCES public.assignments(id) ON DELETE SET NULL,
  course_id       UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  status          TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','missed','rescheduled')),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.study_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own study_blocks" ON public.study_blocks
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_study_blocks_user_date ON public.study_blocks(user_id, plan_date);
CREATE TRIGGER set_study_blocks_updated_at BEFORE UPDATE ON public.study_blocks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Focus sessions (Pomodoro)
CREATE TABLE IF NOT EXISTS public.focus_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  study_block_id  UUID REFERENCES public.study_blocks(id) ON DELETE SET NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  duration_minutes INTEGER,
  status          TEXT DEFAULT 'active' CHECK (status IN ('active','completed','cancelled'))
);

ALTER TABLE public.focus_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own focus_sessions" ON public.focus_sessions
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_focus_sessions_user ON public.focus_sessions(user_id, started_at);

-- Notifications (in-app)
CREATE TABLE IF NOT EXISTS public.notifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  body            TEXT,
  type            TEXT DEFAULT 'reminder' CHECK (type IN ('reminder','alert','system')),
  scheduled_at    TIMESTAMPTZ,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own notifications" ON public.notifications
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, created_at);

-- Quiz attempts (analytics)
CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id      UUID REFERENCES public.practice_sessions(id) ON DELETE CASCADE,
  question_index  INTEGER NOT NULL,
  user_answer     TEXT,
  is_correct      BOOLEAN,
  time_taken_seconds INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own quiz_attempts" ON public.quiz_attempts
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_session ON public.quiz_attempts(session_id);

-- Rubrics (teacher mode)
CREATE TABLE IF NOT EXISTS public.rubrics (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id       UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  criteria        JSONB NOT NULL, -- array of {criterion, description, points}
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.rubrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own rubrics" ON public.rubrics
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.rubric_feedback (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rubric_id       UUID NOT NULL REFERENCES public.rubrics(id) ON DELETE CASCADE,
  assignment_id   UUID REFERENCES public.assignments(id) ON DELETE SET NULL,
  submission_text TEXT,
  feedback        TEXT,
  score_summary   JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.rubric_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own rubric_feedback" ON public.rubric_feedback
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Onboarding state
CREATE TABLE IF NOT EXISTS public.user_onboarding (
  user_id         UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  completed       BOOLEAN DEFAULT FALSE,
  steps           JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_onboarding ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own onboarding" ON public.user_onboarding
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER set_user_onboarding_updated_at BEFORE UPDATE ON public.user_onboarding
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
