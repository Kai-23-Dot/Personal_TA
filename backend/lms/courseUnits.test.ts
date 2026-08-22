import { describe, expect, it } from "vitest";
import { buildGeneratedCourseUnits } from "./courseUnits";

describe("buildGeneratedCourseUnits", () => {
  it("uses explicit course structure before dates", () => {
    const units = buildGeneratedCourseUnits([
      { id: "a", kind: "assignment", title: "Module 2: Project", dueAt: "2026-09-02T12:00:00Z" },
      { id: "b", kind: "note", title: "Unit 1 lecture.pptx", fileType: "pptx" },
      { id: "c", kind: "assignment", title: "Unit 1 Quiz", dueAt: "2026-08-20T12:00:00Z" },
    ]);

    expect(units.map((unit) => unit.moduleName)).toEqual(["Unit 1", "Module 2"]);
    expect(units[0]).toMatchObject({ itemCount: 2, powerpointCount: 1 });
    expect(units[0].assignmentIds).toEqual(["c"]);
    expect(units[0].noteIds).toEqual(["b"]);
  });

  it("groups dated material by week and leaves no material usable", () => {
    const units = buildGeneratedCourseUnits([
      { id: "a", kind: "assignment", title: "Reading", dueAt: "2026-08-18T12:00:00Z" },
      { id: "b", kind: "assignment", title: "Quiz", dueAt: "2026-08-20T12:00:00Z" },
      { id: "c", kind: "note", title: "Syllabus" },
    ]);

    expect(units[0].moduleName).toBe("Week of Aug 17");
    expect(units[0].itemCount).toBe(2);
    expect(units[1].moduleName).toBe("Course Materials 1");
    expect(buildGeneratedCourseUnits([])[0]).toMatchObject({
      moduleName: "Course Materials",
      itemCount: 0,
    });
  });
});
