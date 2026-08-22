import { describe, expect, it } from "vitest";
import { aiCreditsForUsage } from "./provider";

describe("AI cost metering", () => {
  it("converts GPT-4.1 mini usage to $0.001 credits and rounds up", () => {
    expect(
      aiCreditsForUsage(5_000, 1_000, {
        inputPerMillion: 0.4,
        outputPerMillion: 1.6,
      })
    ).toBe(4);
  });

  it("prices vision usage using the more expensive GPT-4o rates", () => {
    expect(
      aiCreditsForUsage(2_000, 1_500, {
        inputPerMillion: 2.5,
        outputPerMillion: 10,
      })
    ).toBe(20);
  });
});
