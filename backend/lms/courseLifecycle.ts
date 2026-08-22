export type CanvasCourseLifecycleInput = {
  name?: string | null;
  course_code?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  term?: {
    name?: string | null;
    start_at?: string | null;
    end_at?: string | null;
  } | null;
};

export type CanvasCourseLifecycle = {
  isActive: boolean;
  academicYear: string | null;
  semester: string | null;
};

function timestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeYear(value: string, referenceYear?: number): number {
  const numeric = Number(value);
  if (value.length === 4) return numeric;
  if (referenceYear !== undefined) {
    const century = Math.floor(referenceYear / 100) * 100;
    const candidate = century + numeric;
    return candidate < referenceYear ? candidate + 100 : candidate;
  }
  return numeric >= 70 ? 1900 + numeric : 2000 + numeric;
}

function inferredAcademicYear(text: string): { startYear: number; endYear: number; label: string } | null {
  const match = text.match(/\b(20\d{2}|\d{2})\s*[-/–]\s*(20\d{2}|\d{2})\b/);
  if (!match) return null;
  const startYear = normalizeYear(match[1]);
  const endYear = normalizeYear(match[2], startYear);
  if (endYear < startYear || endYear - startYear > 1) return null;
  return { startYear, endYear, label: `${startYear}/${String(endYear).slice(-2)}` };
}

function inferredSemester(text: string): "S1" | "S2" | null {
  if (/\b(?:s1|semester\s*1|fall)\b/i.test(text)) return "S1";
  if (/\b(?:s2|semester\s*2|spring)\b/i.test(text)) return "S2";
  return null;
}

function inferredCompactTerm(text: string): {
  startsAt: number;
  endsAt: number;
  academicYear: string;
  semester: string;
} | null {
  const match = text.match(/\b(20\d{2})(SP|SU|FA|WI)\b/i);
  if (!match) return null;
  const year = Number(match[1]);
  const code = match[2].toUpperCase();

  if (code === "SP") {
    return {
      startsAt: Date.UTC(year, 0, 1),
      endsAt: Date.UTC(year, 5, 1),
      academicYear: `${year - 1}/${String(year).slice(-2)}`,
      semester: "Spring",
    };
  }
  if (code === "SU") {
    return {
      startsAt: Date.UTC(year, 4, 1),
      endsAt: Date.UTC(year, 7, 1),
      academicYear: `${year - 1}/${String(year).slice(-2)}`,
      semester: "Summer",
    };
  }
  if (code === "FA") {
    return {
      startsAt: Date.UTC(year, 7, 1),
      endsAt: Date.UTC(year + 1, 0, 16),
      academicYear: `${year}/${String(year + 1).slice(-2)}`,
      semester: "Fall",
    };
  }
  return {
    startsAt: Date.UTC(year, 0, 1),
    endsAt: Date.UTC(year, 3, 1),
    academicYear: `${year - 1}/${String(year).slice(-2)}`,
    semester: "Winter",
  };
}

/**
 * Canvas may keep a concluded class in the `active` enrollment collection.
 * Prefer explicit course/term dates, then conservatively infer the ordinary
 * August-to-August academic-year window from names such as `S2 - 25/26`.
 */
export function getCanvasCourseLifecycle(
  course: CanvasCourseLifecycleInput,
  now = new Date()
): CanvasCourseLifecycle {
  const nowMs = now.getTime();
  const text = [course.name, course.course_code, course.term?.name].filter(Boolean).join(" ");
  const year = inferredAcademicYear(text);
  const compactTerm = inferredCompactTerm(text);
  const semester = compactTerm?.semester ?? inferredSemester(text);

  const explicitStart = timestamp(course.start_at) ?? timestamp(course.term?.start_at);
  const explicitEnd = timestamp(course.end_at) ?? timestamp(course.term?.end_at);

  let inferredStart: number | null = null;
  let inferredEnd: number | null = null;
  if (year) {
    inferredStart = Date.UTC(year.startYear, 7, 1);
    inferredEnd = Date.UTC(year.endYear, 7, 1);
    if (semester === "S1") inferredEnd = Date.UTC(year.endYear, 0, 16);
    if (semester === "S2") inferredStart = Date.UTC(year.endYear, 0, 1);
  }

  const startsAt = explicitStart ?? compactTerm?.startsAt ?? inferredStart;
  const endsAt = explicitEnd ?? compactTerm?.endsAt ?? inferredEnd;
  const isActive = (startsAt === null || nowMs >= startsAt) && (endsAt === null || nowMs < endsAt);

  return {
    isActive,
    academicYear: compactTerm?.academicYear ?? year?.label ?? null,
    semester,
  };
}
