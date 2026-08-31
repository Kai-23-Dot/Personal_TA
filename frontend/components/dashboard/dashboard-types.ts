export type DashboardCourse = {
  id: string;
  name: string;
  color: string | null;
  updated_at?: string | null;
};

export type DashboardAssignment = {
  id: string;
  course_id: string | null;
  title: string;
  description?: string | null;
  due_date: string | null;
  is_completed: boolean;
  assignment_type?: string | null;
  estimated_minutes?: number | null;
  points_possible?: number | null;
  url?: string | null;
  course?: DashboardCourse | null;
};

export type DashboardPrimaryAction = {
  badge: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  tone: "urgent" | "focus" | "clear";
  meta: string[];
};
