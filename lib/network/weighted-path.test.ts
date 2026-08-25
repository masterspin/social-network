import { describe, expect, it } from "vitest";
import { getWeightedShortestPath } from "./weighted-path";

describe("weighted shortest paths", () => {
  it("prefers a stronger longer route over a weaker fewer-hop route", () => {
    const result = getWeightedShortestPath({
      source: "me",
      target: "target",
      edges: [
        { from: "me", to: "weak", type: "one_point_five" },
        { from: "weak", to: "target", type: "first" },
        { from: "me", to: "strong", type: "first" },
        { from: "strong", to: "friend", type: "first" },
        { from: "friend", to: "target", type: "first" },
      ],
    });

    expect(result?.nodeIds).toEqual(["me", "strong", "friend", "target"]);
    expect(result?.totalWeight).toBe(3);
  });

  it("penalizes weak to strong transitions more than strong to weak transitions", () => {
    const result = getWeightedShortestPath({
      source: "me",
      target: "target",
      edges: [
        { from: "me", to: "strong", type: "first" },
        { from: "strong", to: "target", type: "one_point_five" },
        { from: "me", to: "weak", type: "one_point_five" },
        { from: "weak", to: "target", type: "first" },
      ],
    });

    expect(result?.nodeIds).toEqual(["me", "strong", "target"]);
  });

  it("prefers a direct weak connection over a two-hop strong route", () => {
    const result = getWeightedShortestPath({
      source: "me",
      target: "target",
      edges: [
        { from: "me", to: "target", type: "one_point_five" },
        { from: "me", to: "strong", type: "first" },
        { from: "strong", to: "target", type: "first" },
      ],
    });

    expect(result?.nodeIds).toEqual(["me", "target"]);
    expect(result?.totalWeight).toBe(1.5);
  });

  it("does not discount indirect paths", () => {
    const result = getWeightedShortestPath({
      source: "me",
      target: "target",
      edges: [
        { from: "me", to: "strong", type: "first" },
        { from: "strong", to: "target", type: "first" },
      ],
    });

    expect(result?.nodeIds).toEqual(["me", "strong", "target"]);
    expect(result?.totalWeight).toBe(2);
  });

  it("returns null when no accepted path exists", () => {
    const result = getWeightedShortestPath({
      source: "me",
      target: "target",
      edges: [{ from: "me", to: "a", type: "first" }],
    });

    expect(result).toBeNull();
  });
});
