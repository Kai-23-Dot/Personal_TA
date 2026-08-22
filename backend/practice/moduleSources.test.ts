import { describe, expect, it } from "vitest";
import { selectBalancedModuleSources } from "./moduleSources";

function source(id: string, moduleName: string | null) {
  return { id, chunk: { moduleName } };
}

describe("multi-unit practice source selection", () => {
  it("round-robins sources across every selected module", () => {
    const selected = selectBalancedModuleSources(
      [
        source("a1", "Unit A"),
        source("a2", "Unit A"),
        source("a3", "Unit A"),
        source("b1", "Unit B"),
        source("b2", "Unit B"),
        source("c1", "Unit C"),
      ],
      ["Unit A", "Unit B", "Unit C"],
      5
    );

    expect(selected.map((item) => item.id)).toEqual([
      "a1",
      "b1",
      "c1",
      "a2",
      "b2",
    ]);
  });

  it("preserves ranking order for a single selected module", () => {
    const sources = [source("one", "Unit A"), source("two", "Unit A")];
    expect(selectBalancedModuleSources(sources, ["Unit A"], 1)).toEqual([
      sources[0],
    ]);
  });
});
