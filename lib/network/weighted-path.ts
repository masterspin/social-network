export type WeightedConnectionType = "first" | "one_point_five";

export type WeightedPathEdge = {
  from: string;
  to: string;
  type: WeightedConnectionType;
};

export type WeightedShortestPathInput = {
  source: string;
  target: string;
  edges: WeightedPathEdge[];
};

export type WeightedShortestPathResult = {
  nodeIds: string[];
  totalWeight: number;
};

type QueueEntry = {
  nodeId: string;
  previousType: WeightedConnectionType | null;
  weight: number;
  path: string[];
};

const BASE_WEIGHT: Record<WeightedConnectionType, number> = {
  first: 1,
  one_point_five: 3,
};

const DIRECT_TARGET_MULTIPLIER = 0.5;

const TRANSITION_WEIGHT: Record<string, number> = {
  "first:one_point_five": 0.5,
  "one_point_five:first": 1.5,
};

function stateKey(nodeId: string, previousType: WeightedConnectionType | null) {
  return `${nodeId}:${previousType ?? "start"}`;
}

function edgeWeight(
  previousType: WeightedConnectionType | null,
  nextType: WeightedConnectionType,
  isDirectTarget: boolean,
) {
  const transition =
    previousType === null ? 0 : TRANSITION_WEIGHT[`${previousType}:${nextType}`] ?? 0;
  const baseWeight =
    BASE_WEIGHT[nextType] * (isDirectTarget ? DIRECT_TARGET_MULTIPLIER : 1);

  return baseWeight + transition;
}

function dequeueBest(queue: QueueEntry[]) {
  let bestIndex = 0;

  for (let index = 1; index < queue.length; index++) {
    if (queue[index].weight < queue[bestIndex].weight) {
      bestIndex = index;
    } else if (
      queue[index].weight === queue[bestIndex].weight &&
      Math.random() < 0.5
    ) {
      bestIndex = index;
    }
  }

  return queue.splice(bestIndex, 1)[0];
}

export function getWeightedShortestPath({
  source,
  target,
  edges,
}: WeightedShortestPathInput): WeightedShortestPathResult | null {
  if (source === target) return { nodeIds: [source], totalWeight: 0 };

  const adjacency = new Map<string, WeightedPathEdge[]>();
  for (const edge of edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    adjacency.get(edge.from)!.push(edge);
  }

  const queue: QueueEntry[] = [
    { nodeId: source, previousType: null, weight: 0, path: [source] },
  ];
  const bestWeight = new Map<string, number>();

  while (queue.length > 0) {
    const current = dequeueBest(queue);
    const currentKey = stateKey(current.nodeId, current.previousType);
    const settledWeight = bestWeight.get(currentKey);
    if (settledWeight !== undefined && settledWeight < current.weight) continue;

    if (current.nodeId === target) {
      return { nodeIds: current.path, totalWeight: current.weight };
    }

    for (const edge of adjacency.get(current.nodeId) ?? []) {
      if (current.path.includes(edge.to)) continue;

      const isDirectTarget = current.nodeId === source && edge.to === target;
      const nextWeight =
        current.weight +
        edgeWeight(current.previousType, edge.type, isDirectTarget);
      const nextKey = stateKey(edge.to, edge.type);
      const knownWeight = bestWeight.get(nextKey);

      if (knownWeight !== undefined && knownWeight < nextWeight) continue;
      bestWeight.set(nextKey, nextWeight);
      queue.push({
        nodeId: edge.to,
        previousType: edge.type,
        weight: nextWeight,
        path: [...current.path, edge.to],
      });
    }
  }

  return null;
}
