export type CompactLayoutNode = {
  id: string;
  label: string;
  distance?: number;
  x?: number;
  y?: number;
  [key: string]: unknown;
};

const MIN_RING_RADIUS = 0.21;
const NODE_SPACING = 0.225;
const SPACER_DISTANCE = 1.5;

export function layoutCompactNetworkNodes<T extends CompactLayoutNode>(
  nodes: T[],
) {
  const centerNodes = nodes.filter((node) => Math.round(node.distance ?? 1) === 0);
  const outerNodes = nodes.filter((node) => Math.round(node.distance ?? 1) !== 0);
  const outerRadius = Math.max(
    MIN_RING_RADIUS,
    (outerNodes.length * NODE_SPACING) / (Math.PI * 2),
  );

  const positioned = [
    ...centerNodes.map((node) => ({ ...node, x: 0, y: 0 })),
    ...outerNodes.map((node, index) => {
      const angle = (index / Math.max(outerNodes.length, 1)) * Math.PI * 2;

      return {
        ...node,
        x: Math.cos(angle) * outerRadius,
        y: Math.sin(angle) * outerRadius,
      };
    }),
  ];

  const spacers: CompactLayoutNode[] = [
    { id: "__network_spacer_top", x: 0, y: -SPACER_DISTANCE },
    { id: "__network_spacer_right", x: SPACER_DISTANCE, y: 0 },
    { id: "__network_spacer_bottom", x: 0, y: SPACER_DISTANCE },
    { id: "__network_spacer_left", x: -SPACER_DISTANCE, y: 0 },
  ].map((node) => ({
    ...node,
    label: "",
    size: 0,
    hidden: true,
  }));

  return [...positioned, ...spacers];
}
