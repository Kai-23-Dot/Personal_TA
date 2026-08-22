import { describe, expect, it } from "vitest";
import { retainActiveCourseRows } from "./activeCourses";

describe("retainActiveCourseRows", () => {
  it("keeps general content and active-course content only", () => {
    const rows = [
      { id: "general", course_id: null },
      { id: "active", course_id: "course-active" },
      { id: "ended", course_id: "course-ended" },
    ];

    expect(retainActiveCourseRows(rows, ["course-active"]).map((row) => row.id)).toEqual([
      "general",
      "active",
    ]);
  });
});
