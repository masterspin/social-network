import { describe, expect, it } from "vitest";
import { buildNetworkGraph, getShortestPath } from "./graph";

describe("network graph helpers", () => {
  it("finds shortest path between two users", () => {
    const graph = buildNetworkGraph({
      nodes: [
        { id: "me", label: "Me" },
        { id: "a", label: "A" },
        { id: "b", label: "B" },
        { id: "target", label: "Target" },
      ],
      links: [
        { source: "me", target: "a" },
        { source: "a", target: "target" },
        { source: "me", target: "b" },
        { source: "b", target: "a" },
      ],
    });

    expect(getShortestPath(graph, "me", "target")).toEqual([
      "me",
      "a",
      "target",
    ]);
  });

  it("returns empty path when target cannot be reached", () => {
    const graph = buildNetworkGraph({
      nodes: [
        { id: "me", label: "Me" },
        { id: "target", label: "Target" },
      ],
      links: [],
    });

    expect(getShortestPath(graph, "me", "target")).toEqual([]);
  });
});
