import { describe, expect, it } from "vitest";
import {
  calculateGpa,
  gradePointsForPercent,
  predictPointsBasedGrade,
  predictWeightedGrade,
  scoreNeededForPointsTarget,
  scoreNeededForWeightedTarget,
  weightedGradePoints,
} from "./gpa";

describe("GPA calculations", () => {
  it("maps the transparent simple 4.0 scale at every boundary", () => {
    expect(gradePointsForPercent(90)).toEqual({ letter: "A", points: 4 });
    expect(gradePointsForPercent(89.99)).toEqual({ letter: "B", points: 3 });
    expect(gradePointsForPercent(70)).toEqual({ letter: "C", points: 2 });
    expect(gradePointsForPercent(60)).toEqual({ letter: "D", points: 1 });
    expect(gradePointsForPercent(59.99)).toEqual({ letter: "F", points: 0 });
    expect(gradePointsForPercent(-1)).toBeNull();
  });

  it("supports a common plus/minus scale", () => {
    expect(gradePointsForPercent(92, "plus_minus")).toEqual({ letter: "A−", points: 3.7 });
    expect(gradePointsForPercent(87, "plus_minus")).toEqual({ letter: "B+", points: 3.3 });
    expect(gradePointsForPercent(61, "plus_minus")).toEqual({ letter: "D−", points: 0.7 });
  });

  it("adds common rigor bonuses for C-range grades or higher", () => {
    expect(weightedGradePoints(95, "standard")).toBe(4);
    expect(weightedGradePoints(95, "honors")).toBe(4.5);
    expect(weightedGradePoints(95, "advanced")).toBe(5);
    expect(weightedGradePoints(69, "advanced")).toBe(1);
  });

  it("calculates credit-weighted unweighted and weighted GPA", () => {
    expect(calculateGpa([
      { percentage: 95, credits: 1, rigor: "advanced" },
      { percentage: 85, credits: 0.5, rigor: "honors" },
      { percentage: 75, credits: 1, rigor: "standard" },
      { percentage: 100, credits: 1, rigor: "standard", included: false },
    ])).toEqual({
      unweighted: 3,
      weighted: 3.5,
      includedCourses: 3,
      totalCredits: 2.5,
    });
  });

  it("returns no GPA when no valid course grade is included", () => {
    expect(calculateGpa([
      { percentage: null, credits: 1, rigor: "standard" },
      { percentage: 90, credits: 0, rigor: "standard" },
    ])).toBeNull();
  });
});

describe("assignment grade predictions", () => {
  it("projects an assignment using exact point totals", () => {
    expect(predictPointsBasedGrade(450, 500, 80, 100)).toEqual({
      currentPercent: 90,
      projectedPercent: 88.33,
      change: -1.67,
    });
  });

  it("supports extra credit without incorrectly capping the projected grade", () => {
    expect(predictPointsBasedGrade(90, 100, 15, 10)?.projectedPercent).toBe(95.45);
  });

  it("projects an assignment that is a stated share of the course grade", () => {
    expect(predictWeightedGrade(88, 96, 25)).toEqual({
      currentPercent: 88,
      projectedPercent: 90,
      change: 2,
    });
  });

  it("calculates the points needed to reach a target", () => {
    expect(scoreNeededForPointsTarget(450, 500, 100, 90)).toEqual({
      requiredPercent: 90,
      requiredPoints: 90,
      status: "attainable",
    });
  });

  it("marks targets that require extra credit", () => {
    expect(scoreNeededForPointsTarget(300, 400, 50, 90)).toEqual({
      requiredPercent: 210,
      requiredPoints: 105,
      status: "extra-credit-required",
    });
    expect(scoreNeededForWeightedTarget(80, 10, 90)).toEqual({
      requiredPercent: 180,
      requiredPoints: null,
      status: "extra-credit-required",
    });
  });

  it("recognizes a target already secured even with zero on the assignment", () => {
    expect(scoreNeededForPointsTarget(490, 500, 10, 90)).toEqual({
      requiredPercent: 0,
      requiredPoints: 0,
      status: "already-secure",
    });
  });

  it("rejects zero-point and invalid-weight scenarios", () => {
    expect(predictPointsBasedGrade(90, 100, 0, 0)).toBeNull();
    expect(predictWeightedGrade(90, 80, 0)).toBeNull();
    expect(scoreNeededForWeightedTarget(90, 101, 95)).toBeNull();
  });
});
