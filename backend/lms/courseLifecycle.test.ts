import { describe, expect, it } from "vitest";
import { getCanvasCourseLifecycle } from "./courseLifecycle";

describe("getCanvasCourseLifecycle", () => {
  const now = new Date("2026-08-13T20:00:00.000Z");

  it("hides a course after its explicit Canvas term end date", () => {
    expect(getCanvasCourseLifecycle({
      name: "AP Computer Science A",
      term: { name: "2025-2026", end_at: "2026-06-15T23:59:59Z" },
    }, now).isActive).toBe(false);
  });

  it("hides an old academic-year course when Canvas omits term dates", () => {
    const lifecycle = getCanvasCourseLifecycle({
      name: "AP Computer Science A - Burns - S2 - 25/26",
    }, now);
    expect(lifecycle).toMatchObject({ isActive: false, academicYear: "2025/26", semester: "S2" });
  });

  it("activates the new academic year automatically once it begins", () => {
    expect(getCanvasCourseLifecycle({ name: "Calculus - S1 - 26/27" }, now).isActive).toBe(true);
  });

  it("hides compact Canvas summer terms after August begins", () => {
    expect(getCanvasCourseLifecycle({
      name: "2026SU Introduction to Computers (CIS-110-OAB6)",
    }, now)).toMatchObject({
      isActive: false,
      academicYear: "2025/26",
      semester: "Summer",
    });
  });

  it("keeps a compact Canvas fall term active during its academic window", () => {
    expect(getCanvasCourseLifecycle({ name: "2026FA Calculus II" }, now)).toMatchObject({
      isActive: true,
      academicYear: "2026/27",
      semester: "Fall",
    });
  });

  it("keeps an undated course visible instead of guessing", () => {
    expect(getCanvasCourseLifecycle({ name: "Independent Study" }, now).isActive).toBe(true);
  });
});
