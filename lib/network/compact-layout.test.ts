import { describe, expect, it } from "vitest";
import {
  layoutCompactNetworkNodes,
  layoutPathNetworkNodes,
} from "./compact-layout";

describe("compact network layout", () => {
  it("keeps the current user at the center", () => {
    const nodes = layoutCompactNetworkNodes([
      { id: "me", label: "Me", distance: 0 },
      { id: "friend", label: "Friend", distance: 1 },
    ]);

    expect(nodes.find((node) => node.id === "me")).toMatchObject({
      x: 0,
      y: 0,
    });
  });

  it("places direct connections close to the center", () => {
    const nodes = layoutCompactNetworkNodes([
      { id: "me", label: "Me", distance: 0 },
      { id: "friend", label: "Friend", distance: 1 },
    ]);
    const friend = nodes.find((node) => node.id === "friend");

    expect(Math.hypot(friend?.x ?? 0, friend?.y ?? 0)).toBeCloseTo(0.28);
  });

  it("keeps direct connections evenly spaced", () => {
    const nodes = layoutCompactNetworkNodes([
      { id: "me", label: "Me", distance: 0 },
      { id: "a", label: "A", distance: 1 },
      { id: "b", label: "B", distance: 1 },
      { id: "c", label: "C", distance: 1 },
    ]);
    const outerNodes = nodes.filter(
      (node) => !node.hidden && node.id !== "me",
    );
    const distances = outerNodes.map((node) =>
      Math.hypot(node.x ?? 0, node.y ?? 0),
    );

    expect(new Set(distances.map((distance) => distance.toFixed(6)))).toHaveLength(1);
  });

  it("places other nodes outside their direct connection", () => {
    const nodes = layoutCompactNetworkNodes([
      { id: "me", label: "Me", distance: 0 },
      { id: "friend", label: "Friend", distance: 1 },
      { id: "other", label: "Other", distance: 2, parent_id: "friend" },
    ]);
    const friend = nodes.find((node) => node.id === "friend");
    const other = nodes.find((node) => node.id === "other");

    expect(Math.hypot(other?.x ?? 0, other?.y ?? 0)).toBeGreaterThan(
      Math.hypot(friend?.x ?? 0, friend?.y ?? 0),
    );
    expect(other?.x).toBeGreaterThan(friend?.x ?? 0);
  });

  it("adds hidden spacer nodes so sigma does not stretch the compact cluster", () => {
    const nodes = layoutCompactNetworkNodes([{ id: "me", label: "Me", distance: 0 }]);

    expect(nodes.filter((node) => node.hidden)).toHaveLength(4);
    expect(nodes.find((node) => node.id === "__network_spacer_right")).toMatchObject({
      x: 1.5,
      y: 0,
      hidden: true,
    });
  });

  it("places shortest path nodes in order without crossing the center node", () => {
    const nodes = layoutPathNetworkNodes(
      [
        { id: "me", label: "Me", distance: 0 },
        { id: "friend", label: "Friend", distance: 1 },
        { id: "target", label: "Target", distance: 2 },
      ],
      "me",
    ).filter((node) => !node.hidden);

    expect(nodes.map((node) => node.id)).toEqual(["me", "friend", "target"]);
    expect(nodes.map((node) => node.y)).toEqual([0, 0, 0]);
    expect(nodes[0].x).toBeLessThan(nodes[1].x ?? 0);
    expect(nodes[1].x).toBeLessThan(nodes[2].x ?? 0);
  });
});
