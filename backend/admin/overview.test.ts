import { describe, expect, it } from "vitest";
import { parseAdminPeriod } from "./overview";

describe("admin overview periods", () => {
  it("accepts only bounded provider reporting windows", () => {
    expect(parseAdminPeriod("1")).toBe(1);
    expect(parseAdminPeriod("90")).toBe(90);
    expect(parseAdminPeriod("365")).toBe(30);
    expect(parseAdminPeriod("invalid")).toBe(30);
  });
});
