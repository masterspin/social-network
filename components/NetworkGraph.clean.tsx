"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { getCurrentUser, getUserProfile } from "@/lib/supabase/queries";
import Image from "next/image";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => <div>Loading graph...</div>,
});

type NodeData = {
  id: string;
  name: string;
  preferred_name: string | null;
  profile_image_url: string | null;
  distance?: number;
  connection_type?: string;
  path_type?: "first" | "one_point_five" | "pending";
  x?: number;
  y?: number;
};
type LinkData = { 
  source: string; 
  target: string; 
  how_met: string;
  connection_type?: string;
};
type GraphData = { nodes: NodeData[]; links: LinkData[] };
type OpenUser = (user: {
  id: string;
  username?: string;
  name?: string;
  preferred_name?: string | null;
  profile_image_url?: string | null;
}) => void;

export default function NetworkGraph({
  onOpenUser,
}: {
  onOpenUser?: OpenUser;
}) {
  const [graphData, setGraphData] = useState<GraphData>({
    nodes: [],
    links: [],
  });
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [maxDepth, setMaxDepth] = useState<number>(3);
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null);
  const [selectedLink, setSelectedLink] = useState<LinkData | null>(null);
  const [loading, setLoading] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const expandedRef = useRef<Set<string>>(new Set());
  const nodeDepthMapRef = useRef<Map<string, number>>(new Map());
  const [dims, setDims] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth || 500;
      const h = el.clientHeight || 500;
      setDims({ w, h });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Auto-center on initial node load
  useEffect(() => {
    if (graphData.nodes.length > 0 && fgRef.current) {
      setTimeout(() => {
        fgRef.current?.centerAt(0, 0, 0);
        fgRef.current?.zoom(2.0, 0);
      }, 100);
    }
  }, [graphData.nodes.length]);

  const getNodeColor = (n: NodeData) => {
    // Current user is always blue
    if (n.id === currentUserId) return "#3b82f6"; // blue
    
    const dist = n.distance || 0;
    
    // Direct connections (distance 1)
    if (dist === 1) {
      if (n.connection_type === "pending") return "#eab308"; // yellow
      if (n.connection_type === "one_point_five") return "#a855f7"; // purple
      return "#10b981"; // green (first connection)
    }
    
    // Indirect connections - gradient based on path type
    const pathType = n.path_type || n.connection_type;
    
    if (pathType === "pending") {
      // Pending connections should not have children shown
      return "#eab308"; // yellow
    }
    
    if (pathType === "one_point_five") {
      // Purple to gray gradient for 1.5 connection paths
      if (dist === 2) return "#c084fc"; // lighter purple
      if (dist === 3) return "#d8b4fe"; // very light purple
      if (dist === 4) return "#c4b5fd"; // light purple-gray
      if (dist === 5) return "#a8a29e"; // purple-gray
      return "#78716c"; // gray
    }
    
    // First connection path (default) - green to gray gradient
    if (dist === 2) return "#22c55e"; // lighter green
    if (dist === 3) return "#4ade80"; // light green
    if (dist === 4) return "#86efac"; // very light green
    if (dist === 5) return "#a8a29e"; // green-gray
    
    return "#78716c"; // gray for 6+ or unknown
  };
  const getNodeLabel = (n: NodeData) => n.preferred_name || n.name;
  const pushGraphData = useCallback(
    (update: (g: GraphData) => GraphData) =>
      setGraphData((prev) => update(prev)),
    []
  );

  const expandNodeNeighbors = useCallback(
    async (nodeId: string) => {
      if (expandedRef.current.has(nodeId)) return;
      const depthOfNode = nodeDepthMapRef.current.get(nodeId) ?? 0;
      if (depthOfNode >= maxDepth) return;
      expandedRef.current.add(nodeId);
      try {
        const res = await fetch(
          `/api/connections/accepted?userId=${encodeURIComponent(
            nodeId
          )}`
        );
        if (!res.ok) return;
        const j = await res.json();
        pushGraphData((prev) => {
          const existingIds = new Set(prev.nodes.map((n) => n.id));
          const linkKeys = new Set(
            prev.links.map((l) => `${l.source}__${l.target}`)
          );
          const nodes: NodeData[] = [];
          const links: LinkData[] = [];
          for (const row of j.connections || []) {
            for (const other of row.mutual_connections || []) {
              const nextDepth = depthOfNode + 1;
              const prevDepth = nodeDepthMapRef.current.get(other.id);
              if (prevDepth == null || nextDepth < prevDepth)
                nodeDepthMapRef.current.set(other.id, nextDepth);
              if (!existingIds.has(other.id)) {
                existingIds.add(other.id);
                nodes.push({
                  id: other.id,
                  name: other.name,
                  preferred_name: other.preferred_name,
                  profile_image_url: other.profile_image_url,
                  distance: nextDepth,
                });
              }
              const k1 = `${nodeId}__${other.id}`;
              const k2 = `${other.id}__${nodeId}`;
              if (!linkKeys.has(k1) && !linkKeys.has(k2)) {
                linkKeys.add(k1);
                links.push({
                  source: nodeId,
                  target: other.id,
                  how_met: row.how_met,
                });
              }
            }
          }
          return {
            nodes: [...prev.nodes, ...nodes],
            links: [...prev.links, ...links],
          };
        });
      } catch {
        // ignore
      }
    },
    [maxDepth, pushGraphData]
  );

  const loadNetwork = useCallback(async () => {
    console.log("[NetworkGraph] loadNetwork() started");
    setLoading(true);
    try {
      const { user } = await getCurrentUser();
      console.log(
        "[NetworkGraph] getCurrentUser result:",
        user ? `id=${user.id}` : "null"
      );
      if (!user) {
        throw new Error("No user returned");
      }

      console.log("[NetworkGraph] Setting currentUserId:", user.id);
      setCurrentUserId(user.id);
      const { data: viewerProfile } = await getUserProfile(user.id);
      console.log(
        "[NetworkGraph] getUserProfile result:",
        viewerProfile ? "loaded" : "null"
      );
      type ViewerProfile = {
        id: string;
        name: string;
        preferred_name: string | null;
        profile_image_url: string | null;
        visibility_level?: number | null;
      } | null;
      const viewer = viewerProfile as ViewerProfile;
      if (viewer?.visibility_level != null) {
        setMaxDepth(Number(viewer.visibility_level) || 3);
      }
      nodeDepthMapRef.current = new Map([[user.id, 0]]);
      expandedRef.current = new Set();
      pushGraphData(() => ({
        nodes: [
          {
            id: user.id,
            name: viewer?.name || "You",
            preferred_name: viewer?.preferred_name || null,
            profile_image_url: viewer?.profile_image_url || null,
            distance: 0,
          },
        ],
        links: [],
      }));
      console.log(
        "[NetworkGraph] Created initial node, calling expandNodeNeighbors"
      );
      await expandNodeNeighbors(user.id);
      console.log("[NetworkGraph] expandNodeNeighbors completed");
      setLoading(false);
    } catch (err) {
      console.error("[NetworkGraph] loadNetwork failed:", err);
      // Use test fallback data
      console.log("[NetworkGraph] Using fallback (test) data");
      const fallbackId = "test-fallback-user";
      setCurrentUserId(fallbackId);
      nodeDepthMapRef.current = new Map([[fallbackId, 0]]);
      expandedRef.current = new Set();
      pushGraphData(() => ({
        nodes: [
          {
            id: fallbackId,
            name: "You",
            preferred_name: "Fallback User",
            profile_image_url: null,
            distance: 0,
          },
          {
            id: "test-node-1",
            name: "Sample Connection",
            preferred_name: "Sample",
            profile_image_url: null,
            distance: 1,
          },
        ],
        links: [
          {
            source: fallbackId,
            target: "test-node-1",
            how_met: "Test connection",
          },
        ],
      }));
      setLoading(false);
    }
  }, [expandNodeNeighbors, pushGraphData]);

  useEffect(() => {
    loadNetwork();
  }, [loadNetwork]);

  const centerOnMe = () => {
    if (!fgRef.current || !currentUserId) return;
    const me = graphData.nodes.find((n) => n.id === currentUserId) as
      | (NodeData & { x?: number; y?: number })
      | undefined;
    const x = me?.x ?? 0;
    const y = me?.y ?? 0;
    fgRef.current.centerAt(x, y, 600);
    fgRef.current.zoom(2.0, 600);
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-xl">Loading network...</div>
      </div>
    );

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[calc(100vh-140px)] bg-gray-900"
    >
      <div className="absolute inset-0 z-0">
        {dims.w > 0 && dims.h > 0 && (
          <ForceGraph2D
            ref={fgRef}
            width={dims.w}
            height={dims.h}
            backgroundColor="#0f172a"
            graphData={graphData}
            nodeId="id"
            linkSource="source"
            linkTarget="target"
            cooldownTime={15000}
            d3VelocityDecay={0.3}
            enableZoomInteraction
            enableNodeDrag
            nodeCanvasObject={
              ((
                node: Record<string, unknown>,
                ctx: CanvasRenderingContext2D,
                globalScale: number
              ) => {
                const n = node;
                const r = n.id === currentUserId ? 6 : 5;
                ctx.beginPath();
                ctx.arc(
                  (n.x as number) || 0,
                  (n.y as number) || 0,
                  r as number,
                  0,
                  2 * Math.PI
                );
                ctx.fillStyle = getNodeColor(n as NodeData);
                ctx.fill();
                const label = getNodeLabel(n as NodeData);
                const fontSize = 12 / globalScale;
                ctx.font = `${fontSize}px Sans-Serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "top";
                ctx.fillStyle = "#fff";
                ctx.fillText(
                  label,
                  (n.x as number) || 0,
                  ((n.y as number) || 0) + (r as number) + 3
                );
              }) as unknown as (
                node: Record<string, unknown>,
                ctx: CanvasRenderingContext2D,
                globalScale: number
              ) => void
            }
            onNodeClick={
              ((node: Record<string, unknown>) => {
                const n = node as NodeData;
                setSelectedNode(n);
                setSelectedLink(null);
                const depth = nodeDepthMapRef.current.get(n.id) ?? Infinity;
                if (depth < maxDepth) expandNodeNeighbors(n.id);
                if (onOpenUser)
                  onOpenUser({
                    id: n.id,
                    name: n.name,
                    preferred_name: n.preferred_name,
                    profile_image_url: n.profile_image_url,
                  });
              }) as unknown as (node: Record<string, unknown>) => void
            }
            onLinkClick={
              ((link: Record<string, unknown>) => {
                const l = link as LinkData;
                setSelectedLink(l);
                setSelectedNode(null);
              }) as unknown as (link: Record<string, unknown>) => void
            }
          />
        )}
      </div>

      <div className="absolute top-4 left-4 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg z-30">
        <h3 className="font-bold mb-2">Connection Distance</h3>
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-blue-500"></div>
            <span>You</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-green-500"></div>
            <span>1st degree</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-yellow-500"></div>
            <span>2nd degree</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-red-500"></div>
            <span>3rd degree</span>
          </div>
        </div>
      </div>

      {selectedNode && (
        <div className="absolute top-4 right-4 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg z-40 max-w-sm">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-bold text-lg">{getNodeLabel(selectedNode)}</h3>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {selectedNode.distance === 0
              ? "This is you!"
              : `${selectedNode.distance} ${
                  selectedNode.distance === 1 ? "connection" : "connections"
                } away`}
          </p>
          {selectedNode.profile_image_url && (
            <Image
              src={selectedNode.profile_image_url}
              alt={getNodeLabel(selectedNode)}
              width={80}
              height={80}
              className="mt-2 rounded-full object-cover"
            />
          )}
          {onOpenUser && (
            <button
              onClick={() =>
                onOpenUser({
                  id: selectedNode.id,
                  name: selectedNode.name,
                  preferred_name: selectedNode.preferred_name,
                  profile_image_url: selectedNode.profile_image_url,
                })
              }
              className="mt-3 w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm"
            >
              View Profile
            </button>
          )}
        </div>
      )}

      {selectedLink && (
        <div className="absolute top-4 right-4 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg z-40 max-w-sm">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-bold text-lg">Connection</h3>
            <button
              onClick={() => setSelectedLink(null)}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {selectedLink.how_met || "No description"}
          </p>
        </div>
      )}

      <div className="absolute top-4 right-4 z-50 flex gap-2 pointer-events-auto">
        <button
          onClick={centerOnMe}
          className="px-3 py-2 bg-blue-600 text-white rounded shadow"
        >
          Center on Me
        </button>
      </div>
    </div>
  );
}
