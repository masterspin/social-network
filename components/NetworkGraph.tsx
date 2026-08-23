"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SigmaContainer,
  useCamera,
  useLoadGraph,
  useRegisterEvents,
  useSigma,
} from "@react-sigma/core";
import {
  type NodeHoverDrawingFunction,
  type NodeLabelDrawingFunction,
} from "sigma/rendering";
import { Crosshair } from "lucide-react";
import { getCurrentUser, getUserProfile } from "@/lib/supabase/queries";
import {
  buildNetworkGraph,
  graphEdgeKey,
  getPathEdgeKeys,
  getShortestPath,
  isEdgeOnPath,
  type NetworkGraphLink,
  type NetworkGraphNode,
} from "@/lib/network/graph";
import { layoutCompactNetworkNodes } from "@/lib/network/compact-layout";
import { Spinner } from "@/components/ui/Spinner";

type NodeData = {
  id: string;
  name: string;
  preferred_name: string | null;
  profile_image_url: string | null;
  distance?: number;
  connection_type?: string;
  path_type?: "first" | "one_point_five" | "pending";
};

type LinkData = {
  source: string;
  target: string;
  how_met: string;
  connection_type?: string;
};

type GraphData = { nodes: NodeData[]; links: LinkData[] };

type PathFilter = {
  nodes: Array<{
    id: string;
    name: string;
    preferred_name: string | null;
    profile_image_url: string | null;
  }>;
  links: Array<{
    source: string;
    target: string;
    connection_type?: string | null;
  }>;
};

type AcceptedConnectionRow = {
  id: string;
  how_met: string;
  status: string;
  connection_type?: string;
  other_user: {
    id: string;
    name: string;
    preferred_name: string | null;
    profile_image_url: string | null;
  } | null;
};

type OpenUser = (user: {
  id: string;
  name?: string;
  preferred_name?: string | null;
  profile_image_url?: string | null;
}) => void;

const COLOR = {
  me: "#38bdf8",
  first: "#34d399",
  onePointFive: "#a78bfa",
  pending: "#fbbf24",
  distant: "#94a3b8",
  edge: "#64748b",
  path: "#f97316",
};

const NODE_SIZE = 9;

function nodeColor(node: NodeData) {
  if (node.distance === 0) return COLOR.me;
  if ((node.distance ?? 0) > 1) return COLOR.distant;
  if (node.connection_type === "pending" || node.path_type === "pending") {
    return COLOR.pending;
  }
  if (
    node.connection_type === "one_point_five" ||
    node.path_type === "one_point_five"
  ) {
    return COLOR.onePointFive;
  }
  if ((node.distance ?? 0) <= 1) return COLOR.first;
  return COLOR.distant;
}

function displayName(node?: NodeData | null) {
  if (!node) return "";
  return node.preferred_name || node.name || "Unknown";
}

async function fetchAcceptedConnections(userId: string) {
  const res = await fetch(
    `/api/connections/accepted?userId=${encodeURIComponent(userId)}`,
  );
  if (!res.ok) return [];

  const json = await res.json();
  return (json.data || []) as AcceptedConnectionRow[];
}

function mergeConnectionRows(
  graphData: GraphData,
  sourceNode: NodeData,
  rows: AcceptedConnectionRow[],
) {
  const nodes = new Map(graphData.nodes.map((node) => [node.id, node]));
  const links = new Map(
    graphData.links.map((link) => [graphEdgeKey(link.source, link.target), link]),
  );

  for (const row of rows) {
    if (!row.other_user) continue;

    const other = row.other_user;
    const nextDistance = (sourceNode.distance ?? 0) + 1;
    const connectionType =
      row.status === "pending" ? "pending" : row.connection_type || "first";
    const pathType =
      sourceNode.distance === 0
        ? (connectionType as NodeData["path_type"])
        : sourceNode.path_type || "first";
    const existing = nodes.get(other.id);

    if (!existing || nextDistance < (existing.distance ?? Infinity)) {
      nodes.set(other.id, {
        id: other.id,
        name: other.name,
        preferred_name: other.preferred_name,
        profile_image_url: other.profile_image_url,
        distance: nextDistance,
        connection_type: connectionType,
        path_type: pathType,
      });
    }

    const key = graphEdgeKey(sourceNode.id, other.id);
    if (!links.has(key)) {
      links.set(key, {
        source: sourceNode.id,
        target: other.id,
        how_met: row.how_met,
        connection_type: connectionType,
      });
    }
  }

  return { nodes: [...nodes.values()], links: [...links.values()] };
}

const drawNodeLabelBelow: NodeLabelDrawingFunction = (context, data) => {
  if (!data.label) return;

  context.save();
  context.font = "600 12px Inter, ui-sans-serif, system-ui, sans-serif";
  context.fillStyle = "#e2e8f0";
  context.textAlign = "center";
  context.textBaseline = "top";
  context.shadowColor = "#020617";
  context.shadowBlur = 4;
  context.fillText(data.label, data.x, data.y + data.size + 6, 120);
  context.restore();
};

const drawNodeHoverGlow: NodeHoverDrawingFunction = (context, data) => {
  context.save();
  context.beginPath();
  context.arc(data.x, data.y, data.size + 5, 0, Math.PI * 2);
  context.fillStyle = "rgba(255, 255, 255, 0.18)";
  context.fill();
  context.beginPath();
  context.arc(data.x, data.y, data.size + 9, 0, Math.PI * 2);
  context.strokeStyle = "rgba(255, 255, 255, 0.26)";
  context.lineWidth = 2;
  context.stroke();
  context.restore();
};

function createGraph(data: GraphData) {
  const graphInput = {
    nodes: layoutCompactNetworkNodes(
      data.nodes.map<NetworkGraphNode>((node) => ({
        ...node,
        id: node.id,
        type: "circle",
        label: node.distance === 0 ? "You" : displayName(node),
        color: nodeColor(node),
        size: NODE_SIZE,
      })),
    ),
    links: data.links.map<NetworkGraphLink>((link) => ({
      ...link,
      source: link.source,
      target: link.target,
      color: COLOR.edge,
      size: 1,
    })),
  };
  return buildNetworkGraph(graphInput);
}

function GraphEvents({
  graphData,
  currentUserId,
  selectedPath,
  centerNonce,
  onPath,
  onOpenUser,
  onSelectNode,
}: {
  graphData: GraphData;
  currentUserId: string | null;
  selectedPath: string[];
  centerNonce: number;
  onPath: (path: string[]) => void;
  onOpenUser?: OpenUser;
  onSelectNode: (node: NodeData | null) => void;
}) {
  const sigma = useSigma();
  const loadGraph = useLoadGraph();
  const registerEvents = useRegisterEvents();
  const { goto } = useCamera({ duration: 450 });

  const graph = useMemo(() => createGraph(graphData), [graphData]);

  useEffect(() => {
    loadGraph(graph);
  }, [goto, graph, loadGraph]);

  useEffect(() => {
    const pathNodeIds = new Set(selectedPath);
    const pathEdgeKeys = getPathEdgeKeys(graph, selectedPath);
    const pathPairs = new Set(
      selectedPath.slice(0, -1).map((source, index) => {
        return graphEdgeKey(source, selectedPath[index + 1]);
      }),
    );

    sigma.setSetting("nodeReducer", (node, data) => {
      if (!graph.hasNode(node)) return data;

      const isSelected = pathNodeIds.has(node);
      const muted = selectedPath.length > 0 && !isSelected;
      return {
        ...data,
        color: isSelected ? COLOR.path : muted ? "#334155" : data.color,
        size: isSelected ? Math.max(data.size ?? 8, 13) : data.size,
        label: muted ? "" : data.label,
        zIndex: isSelected ? 10 : 0,
      };
    });

    sigma.setSetting("edgeReducer", (edge, data) => {
      const onPath = isEdgeOnPath(graph, edge, pathEdgeKeys, pathPairs);
      const muted = selectedPath.length > 0 && !onPath;
      return {
        ...data,
        color: onPath ? COLOR.path : muted ? "#1e293b" : data.color,
        size: onPath ? 4 : muted ? 0.6 : 1.2,
        hidden: false,
      };
    });

    sigma.refresh();
  }, [graph, selectedPath, sigma]);

  useEffect(() => {
    registerEvents({
      clickNode: ({ node }) => {
        if (!graph.hasNode(node)) return;

        const selected = graphData.nodes.find((candidate) => candidate.id === node);
        onSelectNode(selected || null);

        if (
          currentUserId &&
          node !== currentUserId &&
          graph.hasNode(currentUserId)
        ) {
          onPath(getShortestPath(graph, currentUserId, node));
        } else {
          onPath([]);
        }

        if (selected && onOpenUser) {
          onOpenUser({
            id: selected.id,
            name: selected.name,
            preferred_name: selected.preferred_name,
            profile_image_url: selected.profile_image_url,
          });
        }
      },
      clickStage: () => {
        onPath([]);
        onSelectNode(null);
      },
    });
  }, [
    currentUserId,
    graph,
    graphData.nodes,
    onOpenUser,
    onPath,
    onSelectNode,
    registerEvents,
  ]);

  useEffect(() => {
    if (currentUserId && graph.hasNode(currentUserId)) {
      requestAnimationFrame(() => {
        const nodeDisplayData = sigma.getNodeDisplayData(currentUserId);
        if (!nodeDisplayData) return;
        goto(
          {
            x: nodeDisplayData.x,
            y: nodeDisplayData.y,
          },
          { duration: 450 },
        );
      });
    }
  }, [centerNonce, currentUserId, goto, graph, sigma]);

  return null;
}

export default function NetworkGraph({
  onClearPathFilter,
  onOpenUser,
  pathFilter,
  refreshNonce = 0,
}: {
  onClearPathFilter?: () => void;
  onOpenUser?: OpenUser;
  pathFilter?: PathFilter | null;
  refreshNonce?: number;
}) {
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], links: [] });
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string[]>([]);
  const [centerNonce, setCenterNonce] = useState(0);
  const [loading, setLoading] = useState(true);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [expandedUserIds, setExpandedUserIds] = useState<string[]>([]);
  const [expandingUserId, setExpandingUserId] = useState<string | null>(null);
  const filteredGraphData = useMemo<GraphData | null>(() => {
    if (!pathFilter) return null;

    return {
      nodes: pathFilter.nodes.map((node, index) => ({
        id: node.id,
        name: node.name,
        preferred_name: node.preferred_name,
        profile_image_url: node.profile_image_url,
        distance: node.id === currentUserId ? 0 : index + 1,
        path_type: "first",
      })),
      links: pathFilter.links.map((link) => ({
        source: link.source,
        target: link.target,
        how_met: "",
        connection_type: link.connection_type || "first",
      })),
    };
  }, [currentUserId, pathFilter]);
  const displayedGraphData = filteredGraphData ?? graphData;
  const displayedSelectedPath = filteredGraphData ? [] : selectedPath;

  const expandUserConnections = useCallback(
    async (userId: string) => {
      if (expandedUserIds.includes(userId) || expandingUserId === userId) return;

      const sourceNode = graphData.nodes.find((node) => node.id === userId);
      if (!sourceNode || sourceNode.connection_type === "pending") {
        setExpandedUserIds((ids) => (ids.includes(userId) ? ids : [...ids, userId]));
        return;
      }

      setExpandingUserId(userId);

      try {
        const rows = await fetchAcceptedConnections(userId);
        setGraphData((current) => {
          const currentSource = current.nodes.find((node) => node.id === userId);
          if (!currentSource) return current;
          return mergeConnectionRows(current, currentSource, rows);
        });
        setExpandedUserIds((ids) => (ids.includes(userId) ? ids : [...ids, userId]));
      } finally {
        setExpandingUserId(null);
      }
    },
    [expandedUserIds, expandingUserId, graphData.nodes],
  );

  const loadNetwork = useCallback(async () => {
    setLoading(true);
    setGraphError(null);
    setExpandedUserIds([]);
    setExpandingUserId(null);

    try {
      const { user } = await getCurrentUser();
      if (!user) throw new Error("No user returned from getCurrentUser");

      setCurrentUserId(user.id);
      const { data: viewerProfile } = await getUserProfile(user.id);
      const viewer = viewerProfile as {
        id: string;
        name: string;
        preferred_name: string | null;
        profile_image_url: string | null;
      } | null;
      const viewerNode: NodeData = {
        id: user.id,
        name: viewer?.name || "You",
        preferred_name: viewer?.preferred_name || null,
        profile_image_url: viewer?.profile_image_url || null,
        distance: 0,
        path_type: "first",
      };
      const rows = await fetchAcceptedConnections(user.id);

      setGraphData(mergeConnectionRows({ nodes: [viewerNode], links: [] }, viewerNode, rows));
      setExpandedUserIds([user.id]);
    } catch (error) {
      setGraphData({ nodes: [], links: [] });
      setCurrentUserId(null);
      setGraphError((error as Error).message || "Failed to load network.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNetwork();
  }, [loadNetwork, refreshNonce]);

  useEffect(() => {
    if (
      filteredGraphData ||
      loading ||
      expandingUserId ||
      graphData.nodes.length === 0
    ) {
      return;
    }

    const nextNode = graphData.nodes.find((node) => {
      return (
        !expandedUserIds.includes(node.id) &&
        node.connection_type !== "pending"
      );
    });
    if (!nextNode) return;

    const timer = window.setTimeout(() => {
      void expandUserConnections(nextNode.id);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [
    expandedUserIds,
    expandUserConnections,
    expandingUserId,
    filteredGraphData,
    graphData.nodes,
    loading,
  ]);

  if (loading && graphData.nodes.length === 0) {
    return (
      <div
        className="flex items-center justify-center w-full bg-slate-950 gap-3"
        style={{ height: "calc(100vh - 140px)" }}
      >
        <Spinner size="lg" className="border-slate-600 border-t-slate-300" />
        <span className="text-sm text-slate-300">Loading network...</span>
      </div>
    );
  }

  if (graphError) {
    return (
      <div
        className="flex w-full items-center justify-center bg-slate-950 px-6 text-center"
        style={{ height: "calc(100vh - 140px)" }}
      >
        <div className="max-w-md rounded-lg border border-red-500/20 bg-red-950/30 p-4 text-sm text-red-100">
          {graphError}
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative w-full overflow-hidden bg-slate-950"
      style={{ height: "calc(100vh - 140px)", minHeight: "500px" }}
    >
      <SigmaContainer
        className="network-sigma"
        style={{ height: "100%", width: "100%" }}
        settings={{
          allowInvalidContainer: true,
          defaultNodeColor: COLOR.distant,
          defaultEdgeColor: COLOR.edge,
          labelColor: { color: "#e2e8f0" },
          defaultDrawNodeLabel: drawNodeLabelBelow,
          defaultDrawNodeHover: drawNodeHoverGlow,
          labelDensity: 1,
          labelRenderedSizeThreshold: 8,
          renderEdgeLabels: false,
          enableCameraPanning: true,
          enableCameraZooming: true,
          enableCameraRotation: false,
          zIndex: true,
        }}
      >
        <GraphEvents
          graphData={displayedGraphData}
          currentUserId={currentUserId}
          selectedPath={displayedSelectedPath}
          centerNonce={centerNonce}
          onPath={setSelectedPath}
          onOpenUser={onOpenUser}
          onSelectNode={() => {}}
        />
      </SigmaContainer>

      <style jsx global>{`
        .network-sigma {
          position: absolute;
          inset: 0;
          height: 100%;
          width: 100%;
          overflow: hidden;
          touch-action: none;
        }

        .network-sigma .sigma-container {
          position: absolute;
          inset: 0;
          height: 100%;
          width: 100%;
          overflow: hidden;
          cursor: grab;
        }

        .network-sigma .sigma-container:active {
          cursor: grabbing;
        }

        .network-sigma canvas {
          position: absolute;
          inset: 0;
          display: block;
        }
      `}</style>

      <div className="absolute right-4 top-4 z-40 flex gap-2">
        {filteredGraphData && (
          <button
            type="button"
            onClick={() => {
              setSelectedPath([]);
              onClearPathFilter?.();
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm text-white shadow hover:bg-slate-700"
          >
            Clear path
          </button>
        )}
        <button
          type="button"
          onClick={() => setCenterNonce((value) => value + 1)}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white shadow hover:bg-indigo-500"
        >
          <Crosshair className="h-4 w-4" />
          Center on Me
        </button>
      </div>

      <div className="absolute bottom-4 left-4 z-40 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-slate-900/90 px-3 py-1 text-sky-300">
          You
        </span>
        <span className="rounded-full bg-slate-900/90 px-3 py-1 text-emerald-300">
          Strong
        </span>
        <span className="rounded-full bg-slate-900/90 px-3 py-1 text-violet-300">
          Weak
        </span>
        <span className="rounded-full bg-slate-900/90 px-3 py-1 text-amber-300">
          Pending
        </span>
        <span className="rounded-full bg-slate-900/90 px-3 py-1 text-slate-300">
          Other
        </span>
      </div>
    </div>
  );
}
