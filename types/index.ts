// ============================================================
// PersonalTA.ai — Shared TypeScript Types
// ============================================================

export type Platform = "google_classroom" | "canvas" | "microsoft_teams" | "manual";

// ---- New feature types ----

export interface Flashcard {
  id: string;
  user_id: string;
  course_id: string | null;
  note_id: string | null;
  front: string;
  back: string;
  hint: string | null;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  interval_days: number;
  ease_factor: number;
  repetitions: number;
  next_review: string;
  last_reviewed: string | null;
  times_correct: number;
  times_reviewed: number;
  created_at: string;
  updated_at: string;
  // Joined
  course?: { name: string; color: string };
}

export interface StudyGroup {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  course_id: string | null;
  invite_code: string;
  is_public: boolean;
  max_members: number;
  created_at: string;
  updated_at: string;
  // Joined
  course?: { name: string };
  member_count?: number;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  role: "owner" | "member";
  joined_at: string;
  // Joined
  profile?: { full_name: string | null; avatar_url: string | null; email: string };
}

export interface GroupMessage {
  id: string;
  group_id: string;
  user_id: string;
  content: string;
  message_type: "text" | "note_share" | "quiz_share" | "system";
  metadata: Record<string, unknown>;
  created_at: string;
  // Joined
  profile?: { full_name: string | null; avatar_url: string | null };
}

/** SM-2 spaced repetition grade: 0–5 */
export type SRSGrade = 0 | 1 | 2 | 3 | 4 | 5;
export type AssignmentType = "homework" | "quiz" | "test" | "exam" | "project" | "lab" | "essay" | "other";
export type NoteSourceType = "upload" | "google_drive" | "onedrive" | "manual";
export type FileType = "pdf" | "docx" | "txt" | "md" | "image" | "other";
export type SummaryType = "bullet_points" | "outline" | "detailed" | "unit_aggregate";
export type MasteryLevel = "unknown" | "learning" | "practicing" | "mastered";
export type Difficulty = "easy" | "medium" | "hard" | "adaptive";

// ---- Database Row Types ----

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  grade_level: number | null;
  school_name: string | null;
  timezone: string;
  preferences: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface LmsConnection {
  id: string;
  user_id: string;
  platform: Platform;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  platform_user_id: string | null;
  platform_email: string | null;
  scopes: string[] | null;
  canvas_domain: string | null;
  last_synced_at: string | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Course {
  id: string;
  user_id: string;
  connection_id: string | null;
  platform: Platform;
  platform_id: string | null;
  name: string;
  section: string | null;
  description: string | null;
  teacher_name: string | null;
  teacher_email: string | null;
  color: string;
  is_active: boolean;
  academic_year: string | null;
  semester: string | null;
  created_at: string;
  updated_at: string;
}

export interface Assignment {
  id: string;
  user_id: string;
  course_id: string;
  platform_id: string | null;
  title: string;
  description: string | null;
  assignment_type: AssignmentType;
  due_date: string | null;
  available_from: string | null;
  points_possible: number | null;
  weight: number | null;
  is_completed: boolean;
  completed_at: string | null;
  estimated_minutes: number | null;
  url: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  course?: Course;
}

export interface Submission {
  id: string;
  user_id: string;
  assignment_id: string;
  platform_id: string | null;
  submitted_at: string | null;
  points_earned: number | null;
  grade: string | null;
  feedback: string | null;
  is_late: boolean;
  created_at: string;
  updated_at: string;
}

export interface GradeEvent {
  id: string;
  user_id: string;
  course_id: string;
  submission_id: string | null;
  event_type: "grade_received" | "grade_updated" | "extra_credit";
  points_earned: number | null;
  points_possible: number | null;
  occurred_at: string;
  notes: string | null;
  created_at: string;
}

export interface Note {
  id: string;
  user_id: string;
  course_id: string | null;
  title: string;
  content: string | null;
  source_type: NoteSourceType;
  source_url: string | null;
  source_file_id: string | null;
  file_name: string | null;
  file_type: FileType | null;
  file_size_bytes: number | null;
  storage_path: string | null;
  topic_tags: string[];
  is_processed: boolean;
  word_count: number | null;
  created_at: string;
  updated_at: string;
  // Joined
  course?: Course;
  summaries?: NoteSummary[];
}

export interface NoteSummary {
  id: string;
  user_id: string;
  note_id: string | null;
  course_id: string | null;
  summary_type: SummaryType;
  content: string;
  key_concepts: string[];
  custom_instruction: string | null;
  model_used: string;
  tokens_used: number | null;
  created_at: string;
  updated_at: string;
}

// ---- Study Plan ----

export interface StudyTask {
  id: string;
  title: string;
  description?: string;
  course_id?: string;
  course_name?: string;
  assignment_id?: string;
  task_type: "study" | "homework" | "review" | "practice" | "read";
  estimated_minutes: number;
  actual_minutes?: number;
  is_completed: boolean;
  priority: "low" | "medium" | "high";
  start_time?: string; // HH:MM
  color?: string;
}

export interface StudyPlan {
  id: string;
  user_id: string;
  plan_date: string; // YYYY-MM-DD
  status: "active" | "completed" | "archived";
  tasks: StudyTask[];
  total_minutes: number;
  completed_minutes: number;
  generated_by: "ai" | "manual";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ---- Practice / Quiz ----

export interface QuizQuestion {
  id: string;
  question: string;
  type: "multiple_choice" | "short_answer" | "true_false";
  options?: string[]; // for multiple_choice
  correct_answer: string;
  explanation: string;
  topic: string;
  difficulty: Difficulty;
  user_answer?: string;
  is_correct?: boolean;
  time_taken_seconds?: number;
}

export interface PracticeSession {
  id: string;
  user_id: string;
  course_id: string | null;
  topic: string;
  difficulty: Difficulty;
  question_count: number;
  correct_count: number;
  questions: QuizQuestion[];
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  status: "in_progress" | "completed" | "abandoned";
  created_at: string;
}

export interface PerformanceMetric {
  id: string;
  user_id: string;
  course_id: string | null;
  topic: string;
  subtopic: string | null;
  attempts: number;
  correct: number;
  accuracy_pct: number;
  last_practiced: string | null;
  mastery_level: MasteryLevel;
  created_at: string;
  updated_at: string;
  // Joined
  course?: Course;
}

// ---- Chat ----

export interface ChatMessage {
  id: string;
  user_id: string;
  session_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_name: string | null;
  tool_call_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ---- UI / Utility Types ----

export interface DashboardStats {
  upcomingAssignments: Assignment[];
  todaysTasks: StudyTask[];
  weakAreas: PerformanceMetric[];
  recentSummaries: NoteSummary[];
  overallAccuracy: number;
}

export interface FileUploadResult {
  noteId: string;
  title: string;
  wordCount: number;
  isProcessed: boolean;
}

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string };
