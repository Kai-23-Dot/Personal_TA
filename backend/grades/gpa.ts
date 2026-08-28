export type GpaScale = "simple" | "plus_minus";
export type CourseRigor = "standard" | "honors" | "advanced";

export type GpaCourseInput = {
  percentage: number | null;
  credits: number;
  rigor: CourseRigor;
  included?: boolean;
};

export type GpaResult = {
  unweighted: number;
  weighted: number;
  includedCourses: number;
  totalCredits: number;
};

export type GradePointResult = {
  letter: string;
  points: number;
};

export type GradeProjection = {
  currentPercent: number;
  projectedPercent: number;
  change: number;
};

export type TargetScoreResult = {
  requiredPercent: number;
  requiredPoints: number | null;
  status: "already-secure" | "attainable" | "extra-credit-required";
};

const SIMPLE_SCALE: Array<{ minimum: number; letter: string; points: number }> = [
  { minimum: 90, letter: "A", points: 4 },
  { minimum: 80, letter: "B", points: 3 },
  { minimum: 70, letter: "C", points: 2 },
  { minimum: 60, letter: "D", points: 1 },
  { minimum: Number.NEGATIVE_INFINITY, letter: "F", points: 0 },
];

const PLUS_MINUS_SCALE: Array<{ minimum: number; letter: string; points: number }> = [
  { minimum: 93, letter: "A", points: 4 },
  { minimum: 90, letter: "A−", points: 3.7 },
  { minimum: 87, letter: "B+", points: 3.3 },
  { minimum: 83, letter: "B", points: 3 },
  { minimum: 80, letter: "B−", points: 2.7 },
  { minimum: 77, letter: "C+", points: 2.3 },
  { minimum: 73, letter: "C", points: 2 },
  { minimum: 70, letter: "C−", points: 1.7 },
  { minimum: 67, letter: "D+", points: 1.3 },
  { minimum: 63, letter: "D", points: 1 },
  { minimum: 60, letter: "D−", points: 0.7 },
  { minimum: Number.NEGATIVE_INFINITY, letter: "F", points: 0 },
];

const RIGOR_BONUS: Record<CourseRigor, number> = {
  standard: 0,
  honors: 0.5,
  advanced: 1,
};

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function gradePointsForPercent(
  percentage: number,
  scale: GpaScale = "simple"
): GradePointResult | null {
  if (!isFiniteNumber(percentage) || percentage < 0) return null;
  const rows = scale === "plus_minus" ? PLUS_MINUS_SCALE : SIMPLE_SCALE;
  const row = rows.find((candidate) => percentage >= candidate.minimum);
  return row ? { letter: row.letter, points: row.points } : null;
}

export function weightedGradePoints(
  percentage: number,
  rigor: CourseRigor,
  scale: GpaScale = "simple"
): number | null {
  const base = gradePointsForPercent(percentage, scale);
  if (!base) return null;
  // A common weighted convention adds rigor points only for C-range work or
  // higher. The UI explicitly labels this as an estimate because schools vary.
  const bonus = percentage >= 70 ? RIGOR_BONUS[rigor] : 0;
  return round(Math.min(5, base.points + bonus));
}

export function calculateGpa(
  courses: GpaCourseInput[],
  scale: GpaScale = "simple"
): GpaResult | null {
  const valid = courses.filter((course) =>
    course.included !== false &&
    course.percentage !== null &&
    isFiniteNumber(course.percentage) &&
    course.percentage >= 0 &&
    isFiniteNumber(course.credits) &&
    course.credits > 0
  );
  const totalCredits = valid.reduce((total, course) => total + course.credits, 0);
  if (valid.length === 0 || totalCredits <= 0) return null;

  let unweightedQualityPoints = 0;
  let weightedQualityPointsTotal = 0;
  for (const course of valid) {
    const base = gradePointsForPercent(course.percentage as number, scale);
    const weighted = weightedGradePoints(course.percentage as number, course.rigor, scale);
    if (!base || weighted === null) continue;
    unweightedQualityPoints += base.points * course.credits;
    weightedQualityPointsTotal += weighted * course.credits;
  }

  return {
    unweighted: round(unweightedQualityPoints / totalCredits),
    weighted: round(weightedQualityPointsTotal / totalCredits),
    includedCourses: valid.length,
    totalCredits: round(totalCredits),
  };
}

export function predictPointsBasedGrade(
  currentEarned: number,
  currentPossible: number,
  assignmentEarned: number,
  assignmentPossible: number
): GradeProjection | null {
  if (
    ![currentEarned, currentPossible, assignmentEarned, assignmentPossible].every(isFiniteNumber) ||
    currentEarned < 0 ||
    currentPossible <= 0 ||
    assignmentEarned < 0 ||
    assignmentPossible <= 0
  ) return null;

  const currentPercent = (currentEarned / currentPossible) * 100;
  const projectedPercent = ((currentEarned + assignmentEarned) / (currentPossible + assignmentPossible)) * 100;
  return {
    currentPercent: round(currentPercent),
    projectedPercent: round(projectedPercent),
    change: round(projectedPercent - currentPercent),
  };
}

export function predictWeightedGrade(
  currentPercent: number,
  assignmentPercent: number,
  courseWeightPercent: number
): GradeProjection | null {
  if (
    ![currentPercent, assignmentPercent, courseWeightPercent].every(isFiniteNumber) ||
    currentPercent < 0 ||
    assignmentPercent < 0 ||
    courseWeightPercent <= 0 ||
    courseWeightPercent > 100
  ) return null;

  const weight = courseWeightPercent / 100;
  const projectedPercent = currentPercent * (1 - weight) + assignmentPercent * weight;
  return {
    currentPercent: round(currentPercent),
    projectedPercent: round(projectedPercent),
    change: round(projectedPercent - currentPercent),
  };
}

function targetStatus(requiredPercent: number): TargetScoreResult["status"] {
  if (requiredPercent <= 0) return "already-secure";
  return requiredPercent <= 100 ? "attainable" : "extra-credit-required";
}

export function scoreNeededForPointsTarget(
  currentEarned: number,
  currentPossible: number,
  assignmentPossible: number,
  targetPercent: number
): TargetScoreResult | null {
  if (
    ![currentEarned, currentPossible, assignmentPossible, targetPercent].every(isFiniteNumber) ||
    currentEarned < 0 ||
    currentPossible <= 0 ||
    assignmentPossible <= 0 ||
    targetPercent < 0 ||
    targetPercent > 100
  ) return null;

  const rawRequiredPoints = (targetPercent / 100) * (currentPossible + assignmentPossible) - currentEarned;
  const requiredPoints = Math.max(0, rawRequiredPoints);
  const requiredPercent = (requiredPoints / assignmentPossible) * 100;
  return {
    requiredPercent: round(requiredPercent),
    requiredPoints: round(requiredPoints),
    status: targetStatus(rawRequiredPoints <= 0 ? 0 : requiredPercent),
  };
}

export function scoreNeededForWeightedTarget(
  currentPercent: number,
  courseWeightPercent: number,
  targetPercent: number
): TargetScoreResult | null {
  if (
    ![currentPercent, courseWeightPercent, targetPercent].every(isFiniteNumber) ||
    currentPercent < 0 ||
    courseWeightPercent <= 0 ||
    courseWeightPercent > 100 ||
    targetPercent < 0 ||
    targetPercent > 100
  ) return null;

  const weight = courseWeightPercent / 100;
  const rawRequiredPercent = (targetPercent - currentPercent * (1 - weight)) / weight;
  const requiredPercent = Math.max(0, rawRequiredPercent);
  return {
    requiredPercent: round(requiredPercent),
    requiredPoints: null,
    status: targetStatus(rawRequiredPercent <= 0 ? 0 : requiredPercent),
  };
}
