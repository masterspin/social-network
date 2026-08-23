export type CompactLayoutNode = {
  id: string;
  label: string;
  distance?: number;
  parent_id?: string;
  x?: number;
  y?: number;
  [key: string]: unknown;
};

const MIN_RING_RADIUS = 0.28;
const NODE_SPACING = 0.3;
const CHILD_RING_GAP = 0.34;
const SPACER_DISTANCE = 1.5;
const PATH_NODE_SPACING = 0.34;

export function layoutCompactNetworkNodes<T extends CompactLayoutNode>(
  nodes: T[],
) {
  const centerNodes = nodes.filter((node) => Math.round(node.distance ?? 1) === 0);
  const directNodes = nodes.filter((node) => Math.round(node.distance ?? 1) === 1);
  const childNodes = nodes.filter((node) => Math.round(node.distance ?? 1) > 1);
  const fallbackNodes = nodes.filter((node) => {
    const distance = Math.round(node.distance ?? 1);
    return distance !== 0 && distance !== 1;
  });
  const directRadius = Math.max(
    MIN_RING_RADIUS,
    (Math.max(directNodes.length, 1) * NODE_SPACING) / (Math.PI * 2),
  );
  const angleById = new Map<string, number>();

  const directPositioned = directNodes.map((node, index) => {
    const angle = (index / Math.max(directNodes.length, 1)) * Math.PI * 2;
    angleById.set(node.id, angle);

    return {
      ...node,
      x: Math.cos(angle) * directRadius,
      y: Math.sin(angle) * directRadius,
    };
  });

  const childrenByParent = new Map<string, T[]>();
  const orphanChildren: T[] = [];
  for (const node of childNodes) {
    const parentId = typeof node.parent_id === "string" ? node.parent_id : "";
    if (parentId && angleById.has(parentId)) {
      if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
      childrenByParent.get(parentId)!.push(node);
    } else {
      orphanChildren.push(node);
    }
  }

  const childPositioned = [...childrenByParent.entries()].flatMap(
    ([parentId, group]) => {
      const parentAngle = angleById.get(parentId) ?? 0;
      const spread = Math.min(0.42, Math.max(0.16, group.length * 0.08));

      return group.map((node, index) => {
        const offset =
          group.length === 1
            ? 0
            : -spread / 2 + (spread * index) / (group.length - 1);
        const angle = parentAngle + offset;
        const radius = directRadius + CHILD_RING_GAP;

        return {
          ...node,
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
        };
      });
    },
  );

  const positioned = [
    ...centerNodes.map((node) => ({ ...node, x: 0, y: 0 })),
    ...directPositioned,
    ...childPositioned,
    ...orphanChildren.map((node, index) => {
      const angle = (index / Math.max(fallbackNodes.length, 1)) * Math.PI * 2;
      const radius = directRadius + CHILD_RING_GAP;

      return { ...node, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
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

export function layoutPathNetworkNodes<T extends CompactLayoutNode>(
  nodes: T[],
  centerId?: string | null,
) {
  const centerIndex = Math.max(
    0,
    nodes.findIndex((node) =>
      centerId ? node.id === centerId : Math.round(node.distance ?? 1) === 0,
    ),
  );
  const firstX = -centerIndex * PATH_NODE_SPACING;
  const positioned = nodes.map((node, index) => ({
    ...node,
    x: firstX + index * PATH_NODE_SPACING,
    y: 0,
  }));
  const left = firstX - PATH_NODE_SPACING;
  const right = firstX + Math.max(nodes.length - 1, 0) * PATH_NODE_SPACING + PATH_NODE_SPACING;

  const spacers: CompactLayoutNode[] = [
    { id: "__network_spacer_top", x: 0, y: -SPACER_DISTANCE },
    { id: "__network_spacer_right", x: Math.max(SPACER_DISTANCE, right), y: 0 },
    { id: "__network_spacer_bottom", x: 0, y: SPACER_DISTANCE },
    { id: "__network_spacer_left", x: Math.min(-SPACER_DISTANCE, left), y: 0 },
  ].map((node) => ({
    ...node,
    label: "",
    size: 0,
    hidden: true,
  }));

  return [...positioned, ...spacers];
}
