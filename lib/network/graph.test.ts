import { describe, expect, it } from "vitest";
import {
  buildNetworkGraph,
  getPathEdgeKeys,
  getShortestPath,
  isEdgeOnPath,
} from "./graph";

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

  it("uses stable edge keys for path highlighting", () => {
    const graph = buildNetworkGraph({
      nodes: [
        { id: "me", label: "Me" },
        { id: "target", label: "Target" },
      ],
      links: [{ source: "me", target: "target" }],
    });

    expect(getPathEdgeKeys(graph, ["me", "target"])).toEqual(
      new Set(["me__target"]),
    );
  });

  it("treats stale reducer edge ids as off-path instead of throwing", () => {
    const graph = buildNetworkGraph({
      nodes: [
        { id: "me", label: "Me" },
        { id: "target", label: "Target" },
      ],
      links: [{ source: "me", target: "target" }],
    });

    expect(
      isEdgeOnPath(graph, "geid_212_0", new Set(["me__target"]), new Set()),
    ).toBe(false);
  });

});
