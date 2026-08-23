import { describe, expect, it } from "vitest";
import { layoutCompactNetworkNodes } from "./compact-layout";

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

    expect(Math.hypot(friend?.x ?? 0, friend?.y ?? 0)).toBeCloseTo(0.21);
  });

  it("keeps non-center nodes evenly spaced", () => {
    const nodes = layoutCompactNetworkNodes([
      { id: "me", label: "Me", distance: 0 },
      { id: "a", label: "A", distance: 1 },
      { id: "b", label: "B", distance: 2 },
      { id: "c", label: "C", distance: 3 },
    ]);
    const outerNodes = nodes.filter(
      (node) => !node.hidden && node.id !== "me",
    );
    const distances = outerNodes.map((node) =>
      Math.hypot(node.x ?? 0, node.y ?? 0),
    );

    expect(new Set(distances.map((distance) => distance.toFixed(6)))).toHaveLength(1);
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
});
