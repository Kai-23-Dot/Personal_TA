"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Calculator,
  Check,
  Info,
  Plus,
  RotateCcw,
  Target,
  Trash2,
} from "lucide-react";
import {
  calculateGpa,
  gradePointsForPercent,
  predictPointsBasedGrade,
  predictWeightedGrade,
  scoreNeededForPointsTarget,
  scoreNeededForWeightedTarget,
  weightedGradePoints,
  type CourseRigor,
  type GpaScale,
} from "@/backend/grades/gpa";
import { useSetPageContent } from "@/frontend/contexts/page-context";

export type PredictorCourseSummary = {
  id: string;
  name: string;
  color: string | null;
  currentPercent: number | null;
  earnedPoints: number;
  possiblePoints: number;
  gradedItems: number;
};

export type PredictorAssignment = {
  id: string;
  courseId: string;
  title: string;
  pointsPossible: number | null;
  courseWeight: number | null;
  dueDate: string | null;
};

type CourseScenario = PredictorCourseSummary & {
  currentPercentInput: string;
  creditsInput: string;
  rigor: CourseRigor;
  included: boolean;
  manual: boolean;
};

type ForecastMode = "points" | "weighted";

const RIGOR_LABELS: Record<CourseRigor, string> = {
  standard: "Standard",
  honors: "Honors (+0.5)",
  advanced: "AP / IB / Dual (+1.0)",
};

function toFiniteNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function initialScenarioCourses(courses: PredictorCourseSummary[]): CourseScenario[] {
  return courses.map((course) => ({
    ...course,
    currentPercentInput: course.currentPercent === null ? "" : String(course.currentPercent),
    creditsInput: "1",
    rigor: "standard",
    included: true,
    manual: false,
  }));
}

function formatValue(value: number, digits = 2): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function formatDueDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function inputClassName(extra = ""): string {
  return `h-10 w-full rounded-lg border border-white/10 bg-[#080d19] px-3 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-sky-300/45 focus:ring-2 focus:ring-sky-300/10 ${extra}`;
}

export function GpaPredictor({
  initialCourses,
  upcomingAssignments,
}: {
  initialCourses: PredictorCourseSummary[];
  upcomingAssignments: PredictorAssignment[];
}) {
  const [courses, setCourses] = useState<CourseScenario[]>(() => initialScenarioCourses(initialCourses));
  const [scale, setScale] = useState<GpaScale>("simple");
  const [forecastMode, setForecastMode] = useState<ForecastMode>("points");
  const [selectedCourseId, setSelectedCourseId] = useState(initialCourses[0]?.id ?? "");
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("custom");
  const [assignmentName, setAssignmentName] = useState("Next assignment");
  const [earnedInput, setEarnedInput] = useState("90");
  const [possibleInput, setPossibleInput] = useState("100");
  const [weightInput, setWeightInput] = useState("20");
  const [targetInput, setTargetInput] = useState("90");

  const gpa = useMemo(() => calculateGpa(
    courses.map((course) => ({
      percentage: toFiniteNumber(course.currentPercentInput),
      credits: toFiniteNumber(course.creditsInput) ?? 0,
      rigor: course.rigor,
      included: course.included,
    })),
    scale
  ), [courses, scale]);

  const selectedCourse = courses.find((course) => course.id === selectedCourseId) ?? null;
  const assignmentEarned = toFiniteNumber(earnedInput);
  const assignmentPossible = toFiniteNumber(possibleInput);
  const assignmentWeight = toFiniteNumber(weightInput);
  const targetPercent = toFiniteNumber(targetInput);
  const assignmentPercent = assignmentEarned !== null && assignmentPossible !== null && assignmentPossible > 0
    ? (assignmentEarned / assignmentPossible) * 100
    : null;

  const projection = useMemo(() => {
    if (!selectedCourse || assignmentEarned === null || assignmentPossible === null) return null;
    if (forecastMode === "points") {
      return predictPointsBasedGrade(
        selectedCourse.earnedPoints,
        selectedCourse.possiblePoints,
        assignmentEarned,
        assignmentPossible
      );
    }
    const currentPercent = toFiniteNumber(selectedCourse.currentPercentInput);
    if (currentPercent === null || assignmentPercent === null || assignmentWeight === null) return null;
    return predictWeightedGrade(currentPercent, assignmentPercent, assignmentWeight);
  }, [assignmentEarned, assignmentPercent, assignmentPossible, assignmentWeight, forecastMode, selectedCourse]);

  const targetScore = useMemo(() => {
    if (!selectedCourse || targetPercent === null || assignmentPossible === null) return null;
    if (forecastMode === "points") {
      return scoreNeededForPointsTarget(
        selectedCourse.earnedPoints,
        selectedCourse.possiblePoints,
        assignmentPossible,
        targetPercent
      );
    }
    const currentPercent = toFiniteNumber(selectedCourse.currentPercentInput);
    if (currentPercent === null || assignmentWeight === null) return null;
    return scoreNeededForWeightedTarget(currentPercent, assignmentWeight, targetPercent);
  }, [assignmentPossible, assignmentWeight, forecastMode, selectedCourse, targetPercent]);

  const assistantContext = useMemo(() => {
    const lines = [
      "GPA predictor state (student-entered estimate, not an official transcript calculation)",
      `Scale: ${scale === "simple" ? "4.0 without plus/minus" : "4.0 with plus/minus"}`,
      gpa
        ? `Estimated GPA: ${gpa.unweighted.toFixed(2)} unweighted; ${gpa.weighted.toFixed(2)} weighted across ${gpa.includedCourses} courses and ${gpa.totalCredits} credits.`
        : "Estimated GPA: unavailable until at least one valid course grade is included.",
    ];
    if (selectedCourse && projection) {
      lines.push(
        `Assignment forecast for ${selectedCourse.name}: ${assignmentName}.`,
        `Forecast method: ${forecastMode === "points" ? "points-based" : "percent of final course grade"}.`,
        `Projected course grade: ${projection.currentPercent.toFixed(2)}% to ${projection.projectedPercent.toFixed(2)}% (${projection.change >= 0 ? "+" : ""}${projection.change.toFixed(2)} points).`
      );
    }
    if (targetScore && targetPercent !== null) {
      lines.push(`Target ${targetPercent}% requires ${targetScore.requiredPercent.toFixed(2)}% on this assignment; status: ${targetScore.status}.`);
    }
    return lines.join("\n");
  }, [assignmentName, forecastMode, gpa, projection, scale, selectedCourse, targetPercent, targetScore]);

  useSetPageContent(assistantContext, "gpa-predictor");

  function updateCourse(id: string, patch: Partial<CourseScenario>) {
    setCourses((current) => current.map((course) => course.id === id ? { ...course, ...patch } : course));
  }

  function addManualCourse() {
    const id = `manual-${Date.now()}`;
    setCourses((current) => [
      ...current,
      {
        id,
        name: `Course ${current.length + 1}`,
        color: "#7dd3fc",
        currentPercent: null,
        currentPercentInput: "",
        creditsInput: "1",
        rigor: "standard",
        included: true,
        manual: true,
        earnedPoints: 0,
        possiblePoints: 0,
        gradedItems: 0,
      },
    ]);
    setSelectedCourseId(id);
    setSelectedAssignmentId("custom");
    setForecastMode("weighted");
  }

  function removeManualCourse(id: string) {
    const next = courses.filter((course) => course.id !== id);
    setCourses(next);
    if (selectedCourseId === id) setSelectedCourseId(next[0]?.id ?? "");
  }

  function chooseCourse(id: string) {
    setSelectedCourseId(id);
    setSelectedAssignmentId("custom");
    const course = courses.find((candidate) => candidate.id === id);
    if (!course || course.possiblePoints <= 0) setForecastMode("weighted");
  }

  function chooseAssignment(id: string) {
    setSelectedAssignmentId(id);
    const assignment = upcomingAssignments.find((candidate) => candidate.id === id);
    if (!assignment) {
      setAssignmentName("Next assignment");
      return;
    }
    setSelectedCourseId(assignment.courseId);
    setAssignmentName(assignment.title);
    if (assignment.pointsPossible && assignment.pointsPossible > 0) {
      setPossibleInput(String(assignment.pointsPossible));
      setEarnedInput(String(Math.round(assignment.pointsPossible * 0.9 * 100) / 100));
    }
    if (assignment.courseWeight && assignment.courseWeight > 0) {
      setWeightInput(String(assignment.courseWeight));
    }
    const course = courses.find((candidate) => candidate.id === assignment.courseId);
    setForecastMode(course && course.possiblePoints > 0 ? "points" : "weighted");
  }

  function applyProjection() {
    if (!selectedCourse || !projection) return;
    updateCourse(selectedCourse.id, { currentPercentInput: String(projection.projectedPercent) });
    // The modeled assignment is now reflected in the course row. Clear its
    // score so an accidental second click cannot apply the same work twice.
    setEarnedInput("");
  }

  function resetScenario() {
    setCourses(initialScenarioCourses(initialCourses));
    setScale("simple");
    setForecastMode("points");
    setSelectedCourseId(initialCourses[0]?.id ?? "");
    setSelectedAssignmentId("custom");
    setAssignmentName("Next assignment");
    setEarnedInput("90");
    setPossibleInput("100");
    setWeightInput("20");
    setTargetInput("90");
  }

  const projectionGrade = projection ? gradePointsForPercent(projection.projectedPercent, scale) : null;
  const projectionWeightedPoints = projection && selectedCourse
    ? weightedGradePoints(projection.projectedPercent, selectedCourse.rigor, scale)
    : null;
  const canUsePointsMode = Boolean(selectedCourse && selectedCourse.possiblePoints > 0);

  return (
    <section
      className="overflow-hidden rounded-2xl border border-sky-300/15 bg-[linear-gradient(145deg,rgba(10,17,32,0.96),rgba(5,9,18,0.98))] shadow-[0_24px_90px_rgba(1,6,20,0.28)]"
      data-testid="gpa-predictor"
      data-notion-surface
    >
      <div className="border-b border-white/[0.08] px-4 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-sky-300/20 bg-sky-300/[0.08] text-sky-200">
              <Calculator className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold tracking-[-0.025em] text-white">GPA &amp; grade predictor</h2>
                <span className="rounded-full border border-amber-300/20 bg-amber-300/[0.07] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-100">
                  Estimate, not official
                </span>
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
                Forecast an assignment, apply it to a course, and see the resulting weighted and unweighted GPA.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={resetScenario}
            className="inline-flex min-h-10 w-fit items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm font-medium text-slate-300 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Reset scenario
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/[0.08] bg-black/15 p-4" aria-live="polite">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Unweighted</p>
            <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-white">{gpa ? gpa.unweighted.toFixed(2) : "—"}</p>
            <p className="mt-1 text-xs text-slate-500">Common 4.0 estimate</p>
          </div>
          <div className="rounded-xl border border-sky-300/15 bg-sky-300/[0.05] p-4" aria-live="polite">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-300/70">Weighted</p>
            <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-sky-100">{gpa ? gpa.weighted.toFixed(2) : "—"}</p>
            <p className="mt-1 text-xs text-slate-500">Up to a 5.0 estimate</p>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-black/15 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Included</p>
            <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-white">{gpa?.includedCourses ?? 0}</p>
            <p className="mt-1 text-xs text-slate-500">{gpa ? `${formatValue(gpa.totalCredits)} total credits` : "Add a valid course grade"}</p>
          </div>
        </div>

        <div className="mt-4 inline-flex rounded-lg border border-white/[0.08] bg-black/15 p-1" aria-label="GPA scale">
          <button
            type="button"
            aria-pressed={scale === "simple"}
            onClick={() => setScale("simple")}
            className={`rounded-md px-3 py-2 text-xs font-medium transition-colors ${scale === "simple" ? "bg-sky-200 text-slate-950" : "text-slate-400 hover:text-white"}`}
          >
            No +/−
          </button>
          <button
            type="button"
            aria-pressed={scale === "plus_minus"}
            onClick={() => setScale("plus_minus")}
            className={`rounded-md px-3 py-2 text-xs font-medium transition-colors ${scale === "plus_minus" ? "bg-sky-200 text-slate-950" : "text-slate-400 hover:text-white"}`}
          >
            Use +/−
          </button>
        </div>
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1.2fr)_minmax(23rem,0.8fr)]">
        <div className="border-b border-white/[0.08] p-4 sm:p-6 xl:border-b-0 xl:border-r">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-white">Courses in this estimate</h3>
              <p className="mt-1 text-xs text-slate-500">Adjust the grade, credit value, and course rigor.</p>
            </div>
            <button
              type="button"
              onClick={addManualCourse}
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs font-semibold text-sky-200 transition-colors hover:bg-sky-300/[0.07]"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add course
            </button>
          </div>

          {courses.length === 0 ? (
            <button
              type="button"
              onClick={addManualCourse}
              className="mt-5 flex min-h-32 w-full flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-5 text-center transition-colors hover:border-sky-300/30 hover:bg-sky-300/[0.03]"
            >
              <Plus className="h-5 w-5 text-sky-300" aria-hidden="true" />
              <span className="mt-2 text-sm font-semibold text-slate-200">Add your first course</span>
              <span className="mt-1 text-xs text-slate-500">You can calculate GPA without connecting Canvas.</span>
            </button>
          ) : (
            <div className="mt-5 space-y-2.5">
              {courses.map((course) => {
                const percentage = toFiniteNumber(course.currentPercentInput);
                const grade = percentage === null ? null : gradePointsForPercent(percentage, scale);
                const weighted = percentage === null ? null : weightedGradePoints(percentage, course.rigor, scale);
                return (
                  <div
                    key={course.id}
                    className={`rounded-xl border p-3 transition-colors ${course.included ? "border-white/[0.09] bg-white/[0.025]" : "border-white/[0.05] bg-black/10 opacity-60"}`}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={course.included}
                        aria-label={`${course.included ? "Exclude" : "Include"} ${course.name} in GPA`}
                        onClick={() => updateCourse(course.id, { included: !course.included })}
                        className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border transition-colors ${course.included ? "border-sky-300/40 bg-sky-300/15 text-sky-200" : "border-white/15 text-transparent"}`}
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: course.color ?? "#7dd3fc" }} />
                      {course.manual ? (
                        <input
                          aria-label="Course name"
                          value={course.name}
                          onChange={(event) => updateCourse(course.id, { name: event.target.value })}
                          className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-white outline-none placeholder:text-slate-600"
                          placeholder="Course name"
                        />
                      ) : (
                        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white" title={course.name}>{course.name}</p>
                      )}
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-slate-200">{grade ? grade.letter : "—"}</p>
                        <p className="text-[10px] text-slate-600">{grade && weighted !== null ? `${grade.points.toFixed(1)} / ${weighted.toFixed(1)} pts` : "GPA points"}</p>
                      </div>
                      {course.manual ? (
                        <button
                          type="button"
                          aria-label={`Remove ${course.name}`}
                          onClick={() => removeManualCourse(course.id)}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-600 transition-colors hover:bg-rose-400/10 hover:text-rose-300"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,0.6fr)_minmax(0,1.3fr)]">
                      <label className="space-y-1">
                        <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-slate-600">Course grade</span>
                        <div className="relative">
                          <input
                            aria-label={`${course.name} course grade percent`}
                            type="number"
                            min="0"
                            max="200"
                            step="0.01"
                            value={course.currentPercentInput}
                            onChange={(event) => updateCourse(course.id, { currentPercentInput: event.target.value })}
                            className={inputClassName("pr-8")}
                            placeholder="—"
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-600">%</span>
                        </div>
                      </label>
                      <label className="space-y-1">
                        <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-slate-600">Credits</span>
                        <input
                          aria-label={`${course.name} credits`}
                          type="number"
                          min="0.25"
                          max="10"
                          step="0.25"
                          value={course.creditsInput}
                          onChange={(event) => updateCourse(course.id, { creditsInput: event.target.value })}
                          className={inputClassName()}
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-slate-600">Course rigor</span>
                        <select
                          aria-label={`${course.name} course rigor`}
                          value={course.rigor}
                          onChange={(event) => updateCourse(course.id, { rigor: event.target.value as CourseRigor })}
                          className={inputClassName()}
                        >
                          {(Object.keys(RIGOR_LABELS) as CourseRigor[]).map((rigor) => (
                            <option key={rigor} value={rigor}>{RIGOR_LABELS[rigor]}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {!course.manual && course.gradedItems > 0 ? (
                      <p className="mt-2 text-[10px] text-slate-600">
                        Synced basis: {formatValue(course.earnedPoints)} / {formatValue(course.possiblePoints)} points across {course.gradedItems} graded item{course.gradedItems === 1 ? "" : "s"}.
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-violet-300/20 bg-violet-300/[0.08] text-violet-200">
              <Target className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-white">Assignment forecast</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">Test one score, then apply the result to the GPA scenario.</p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {upcomingAssignments.length > 0 ? (
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-400">Upcoming assignment</span>
                <select
                  value={selectedAssignmentId}
                  onChange={(event) => chooseAssignment(event.target.value)}
                  className={inputClassName()}
                >
                  <option value="custom">Custom assignment</option>
                  {upcomingAssignments.map((assignment) => (
                    <option key={assignment.id} value={assignment.id}>
                      {assignment.title}{assignment.dueDate ? ` · ${formatDueDate(assignment.dueDate)}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-xs font-medium text-slate-400">Course</span>
                <select
                  value={selectedCourseId}
                  onChange={(event) => chooseCourse(event.target.value)}
                  className={inputClassName()}
                  disabled={courses.length === 0}
                >
                  {courses.length === 0 ? <option value="">Add a course first</option> : null}
                  {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
                </select>
              </label>
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-xs font-medium text-slate-400">Assignment name</span>
                <input
                  value={assignmentName}
                  onChange={(event) => setAssignmentName(event.target.value)}
                  className={inputClassName()}
                />
              </label>
            </div>

            <fieldset>
              <legend className="text-xs font-medium text-slate-400">Calculation method</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  aria-pressed={forecastMode === "points"}
                  disabled={!canUsePointsMode}
                  onClick={() => setForecastMode("points")}
                  className={`min-h-11 rounded-lg border px-3 text-xs font-semibold transition-colors ${forecastMode === "points" ? "border-sky-300/35 bg-sky-300/10 text-sky-100" : "border-white/10 text-slate-400 hover:bg-white/[0.04]"} disabled:cursor-not-allowed disabled:opacity-35`}
                >
                  Total points
                </button>
                <button
                  type="button"
                  aria-pressed={forecastMode === "weighted"}
                  onClick={() => setForecastMode("weighted")}
                  className={`min-h-11 rounded-lg border px-3 text-xs font-semibold transition-colors ${forecastMode === "weighted" ? "border-sky-300/35 bg-sky-300/10 text-sky-100" : "border-white/10 text-slate-400 hover:bg-white/[0.04]"}`}
                >
                  % of course grade
                </button>
              </div>
              {!canUsePointsMode ? (
                <p className="mt-2 text-[11px] leading-4 text-slate-600">Total-points mode needs at least one synced graded item for this course.</p>
              ) : null}
            </fieldset>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-400">Your score</span>
                <input
                  aria-label="Predicted points earned"
                  type="number"
                  min="0"
                  step="0.01"
                  value={earnedInput}
                  onChange={(event) => setEarnedInput(event.target.value)}
                  className={inputClassName()}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-400">Points possible</span>
                <input
                  aria-label="Predicted points possible"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={possibleInput}
                  onChange={(event) => setPossibleInput(event.target.value)}
                  className={inputClassName()}
                />
              </label>
              {forecastMode === "weighted" ? (
                <label className="space-y-1.5">
                  <span className="text-xs font-medium text-slate-400">Course weight</span>
                  <div className="relative">
                    <input
                      aria-label="Assignment percent of course grade"
                      type="number"
                      min="0.01"
                      max="100"
                      step="0.01"
                      value={weightInput}
                      onChange={(event) => setWeightInput(event.target.value)}
                      className={inputClassName("pr-8")}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-600">%</span>
                  </div>
                </label>
              ) : null}
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-slate-400">Target course grade</span>
                <div className="relative">
                  <input
                    aria-label="Target course grade percent"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={targetInput}
                    onChange={(event) => setTargetInput(event.target.value)}
                    className={inputClassName("pr-8")}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-600">%</span>
                </div>
              </label>
            </div>

            <div className="rounded-xl border border-white/[0.09] bg-black/20 p-4" aria-live="polite">
              {projection && selectedCourse ? (
                <>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">Projected course grade</p>
                      <div className="mt-2 flex flex-wrap items-baseline gap-2">
                        <span className="text-3xl font-semibold tracking-[-0.04em] text-white">{formatValue(projection.projectedPercent)}%</span>
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${projection.change > 0 ? "text-emerald-300" : projection.change < 0 ? "text-rose-300" : "text-slate-400"}`}>
                          {projection.change > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : projection.change < 0 ? <ArrowDownRight className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
                          {projection.change > 0 ? "+" : ""}{formatValue(projection.change)} pts
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {projectionGrade ? `${projectionGrade.letter} · ${projectionGrade.points.toFixed(1)} unweighted` : "Outside the selected GPA scale"}
                        {projectionWeightedPoints !== null ? ` · ${projectionWeightedPoints.toFixed(1)} weighted` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={applyProjection}
                      className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-sky-200 px-3 text-xs font-semibold text-slate-950 transition-colors hover:bg-sky-100"
                    >
                      Apply to GPA
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-sm leading-6 text-slate-500">
                  {courses.length === 0
                    ? "Add a course to start forecasting."
                    : forecastMode === "points" && !canUsePointsMode
                      ? "Switch to percent-of-course mode or sync a graded item."
                      : "Enter a valid score and course weight to calculate the forecast."}
                </p>
              )}
            </div>

            {targetScore && targetPercent !== null ? (
              <div className={`rounded-xl border p-4 ${targetScore.status === "extra-credit-required" ? "border-rose-300/20 bg-rose-300/[0.05]" : targetScore.status === "already-secure" ? "border-emerald-300/20 bg-emerald-300/[0.05]" : "border-violet-300/20 bg-violet-300/[0.05]"}`} aria-live="polite">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Score needed for {formatValue(targetPercent)}%</p>
                <p className="mt-2 text-lg font-semibold text-white">
                  {targetScore.status === "already-secure"
                    ? "Target already secured"
                    : `${formatValue(targetScore.requiredPercent)}%${targetScore.requiredPoints !== null ? ` · ${formatValue(targetScore.requiredPoints)} points` : ""}`}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {targetScore.status === "extra-credit-required"
                    ? "This target is not reachable with the listed points unless extra credit is available."
                    : targetScore.status === "already-secure"
                      ? "Even a zero on this assignment would leave the modeled course grade at or above the target."
                      : "This target is mathematically reachable in the selected scenario."}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <details className="group border-t border-white/[0.08] px-4 py-4 sm:px-6">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-slate-400 transition-colors hover:text-slate-200">
          <Info className="h-4 w-4 text-sky-300" aria-hidden="true" />
          How this estimate works
        </summary>
        <div className="mt-3 grid gap-3 text-xs leading-5 text-slate-500 md:grid-cols-3">
          <p><strong className="text-slate-300">GPA:</strong> The default maps A/B/C/D/F to 4/3/2/1/0. Honors adds 0.5 and AP, IB, or dual enrollment adds 1.0 for grades of 70% or higher.</p>
          <p><strong className="text-slate-300">Prediction:</strong> Total-points mode uses synced earned and possible points. Course-weight mode treats this assignment as the percentage of the final grade you enter.</p>
          <p><strong className="text-slate-300">Important:</strong> Schools may use different cutoffs, credits, category weights, dropped scores, or GPA rules. Smartlearn never writes these what-if values back to Canvas.</p>
        </div>
      </details>
    </section>
  );
}
