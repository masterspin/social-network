import Graph from "graphology";
import { bidirectional } from "graphology-shortest-path";

export type NetworkGraphNode = {
  id: string;
  label: string;
  x?: number;
  y?: number;
  size?: number;
  color?: string;
  [key: string]: unknown;
};

export type NetworkGraphLink = {
  source: string;
  target: string;
  [key: string]: unknown;
};

export type NetworkGraphInput = {
  nodes: NetworkGraphNode[];
  links: NetworkGraphLink[];
};

export function buildNetworkGraph(input: NetworkGraphInput) {
  const graph = new Graph({ multi: false, type: "undirected" });

  for (const node of input.nodes) {
    graph.mergeNode(node.id, node);
  }

  for (const link of input.links) {
    if (!graph.hasNode(link.source) || !graph.hasNode(link.target)) continue;
    graph.mergeEdge(link.source, link.target, link);
  }

  return graph;
}

export function getShortestPath(
  graph: Graph,
  source: string,
  target: string,
): string[] {
  if (!graph.hasNode(source) || !graph.hasNode(target)) return [];
  return bidirectional(graph, source, target) ?? [];
}

export function getPathEdgeKeys(graph: Graph, path: string[]): Set<string> {
  const edgeKeys = new Set<string>();

  for (let i = 0; i < path.length - 1; i++) {
    const edge = graph.edge(path[i], path[i + 1]);
    if (edge) edgeKeys.add(edge);
  }

  return edgeKeys;
}
