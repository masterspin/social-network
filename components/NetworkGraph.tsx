"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { getCurrentUser, getUserProfile } from "@/lib/supabase/queries";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => <div className="text-white p-4">Loading graph...</div>,
});

type NodeData = {
  id: string;
  name: string;
  preferred_name: string | null;
  profile_image_url: string | null;
  distance?: number;
  connection_type?: string;
  path_type?: "first" | "one_point_five" | "pending"; // How we reached this node
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
  const graphDataRef = useRef<GraphData>({ nodes: [], links: [] });
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [maxDepth, setMaxDepth] = useState<number>(3);
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null);
  const [selectedLink, setSelectedLink] = useState<LinkData | null>(null);
  const [hoveredNode, setHoveredNode] = useState<NodeData | null>(null);
  const [centerPressed, setCenterPressed] = useState(false);
  const [loading, setLoading] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const expandedRef = useRef<Set<string>>(new Set());
  const nodeDepthMapRef = useRef<Map<string, number>>(new Map());
  const openedNodeRef = useRef<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  useEffect(() => {
    console.log(
      "[NetworkGraph] ResizeObserver effect running, containerRef.current=",
      containerRef.current
    );
    const el = containerRef.current;
    if (!el) {
      console.log("[NetworkGraph] Container ref is null, skipping setup");
      return;
    }

    const update = () => {
      const rect = el.getBoundingClientRect();
      let w = rect.width;
      let h = rect.height;

      // Fallback: if we still don't have dimensions, calculate from viewport
      if (!w || w === 0) w = window.innerWidth || 500;
      if (!h || h === 0) {
        h = window.innerHeight - 140 || 500;
      }

      console.log(
        "[NetworkGraph] ResizeObserver update: rect=",
        { w: rect.width, h: rect.height },
        "client=",
        { w: el.clientWidth, h: el.clientHeight },
        "final=",
        { w, h }
      );
      if (w > 0 && h > 0) {
        setDims({ w, h });
      }
    };

    // Initial measurement with multiple retries using requestAnimationFrame
    let attempts = 0;
    const tryMeasure = () => {
      attempts++;
      console.log("[NetworkGraph] Measurement attempt", attempts);
      update();
      if (attempts < 10) {
        requestAnimationFrame(tryMeasure);
      }
    };
    requestAnimationFrame(tryMeasure);

    const ro = new ResizeObserver(update);
    ro.observe(el);

    // Also listen to window resize
    window.addEventListener("resize", update);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  // Capture ForceGraph2D ref from canvas after mounting
  useEffect(() => {
    // react-force-graph-2d has built-in zoom and pan interaction
    // No need to manually capture refs
  }, []);

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
    
    // Debug log
    if (dist > 1) {
      console.log(`[Color] Node ${n.name} dist=${dist} connection_type=${n.connection_type} path_type=${n.path_type} pathType=${pathType}`);
    }
    
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

  // Debug logging
  useEffect(() => {
    console.log(
      "[NetworkGraph] State update - userId:",
      currentUserId,
      "nodes:",
      graphData.nodes.length,
      "links:",
      graphData.links.length,
      "dims:",
      dims,
      "loading:",
      loading
    );
  }, [
    currentUserId,
    graphData.nodes.length,
    graphData.links.length,
    dims,
    loading,
  ]);

  // Handle opening user profile when a node is selected
  useEffect(() => {
    if (
      selectedNode &&
      onOpenUser &&
      openedNodeRef.current !== selectedNode.id
    ) {
      openedNodeRef.current = selectedNode.id;
      onOpenUser({
        id: selectedNode.id,
        name: selectedNode.name,
        preferred_name: selectedNode.preferred_name,
        profile_image_url: selectedNode.profile_image_url,
      });
    }
    // Only depend on selectedNode.id to avoid infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNode?.id]);

  const expandNodeNeighbors = useCallback(
    async (nodeId: string) => {
      console.log("[NetworkGraph] expandNodeNeighbors called for:", nodeId);
      if (expandedRef.current.has(nodeId)) {
        console.log("[NetworkGraph] Already expanded, skipping");
        return;
      }
      
      // Check if this node is a pending connection - don't expand it
      const currentNode = graphDataRef.current.nodes.find(n => n.id === nodeId);
      if (currentNode?.connection_type === "pending") {
        console.log("[NetworkGraph] Node is pending connection, not expanding");
        return;
      }
      
      const depthOfNode = nodeDepthMapRef.current.get(nodeId) ?? 0;
      if (depthOfNode >= maxDepth) {
        console.log("[NetworkGraph] Max depth reached for:", nodeId);
        return;
      }
      expandedRef.current.add(nodeId);
      
      // Determine the path type for children of this node
      const nodePathType = currentNode?.path_type || currentNode?.connection_type || "first";
      console.log(`[ExpandStart] Expanding ${nodeId} with path_type=${currentNode?.path_type} connection_type=${currentNode?.connection_type} nodePathType=${nodePathType}`);
      
      try {
        const res = await fetch(
          `/api/connections/accepted?userId=${encodeURIComponent(nodeId)}`
        );
        if (!res.ok) {
          console.error(
            "[NetworkGraph] API error:",
            res.status,
            res.statusText
          );
          return;
        }
        const j = await res.json();
        console.log("[NetworkGraph] API response for", nodeId, ":", j);
        const rows = (j.data || []) as Array<{
          id: string;
          how_met: string;
          status: string;
          connection_type?: string;
          other_user: {
            id: string;
            username: string;
            name: string;
            preferred_name: string | null;
            profile_image_url: string | null;
          };
        }>;
        console.log("[NetworkGraph] Parsed", rows.length, "connections");

        if (rows.length === 0) {
          console.log("[NetworkGraph] No new connections to add");
          return;
        }

        setGraphData((prev) => {
          const nodes = [...prev.nodes];
          const links = [...prev.links];
          const existingIds = new Set(nodes.map((n) => n.id));
          const linkKeys = new Set(
            links.map((l) => `${l.source}__${l.target}`)
          );
          let addedNodes = 0;
          let addedLinks = 0;
          
          // Hierarchy: first > one_point_five > pending
          const getPathPriority = (type?: string) => {
            if (type === "first") return 3;
            if (type === "one_point_five") return 2;
            if (type === "pending") return 1;
            return 0;
          };

          for (const row of rows) {
            const other = row.other_user;

            if (!other) {
              console.warn(
                "[NetworkGraph] Skipping connection with missing `other_user` data:",
                row
              );
              continue;
            }
            
            const nextDepth = depthOfNode + 1;
            const rowType = row.status === "pending" ? "pending" : (row.connection_type || "first");
            
            // Determine path type: inherit from parent unless this is a direct connection from user
            const pathType = depthOfNode === 0 ? rowType : nodePathType;
            
            console.log(`[Expand] Adding ${other.name}: depth=${nextDepth} rowType=${rowType} nodePathType=${nodePathType} pathType=${pathType}`);
            
            const existingNode = nodes.find(n => n.id === other.id);
            
            if (existingNode) {
              // Node exists - update if we have a better path (higher priority or shorter distance)
              const existingPriority = getPathPriority(existingNode.path_type);
              const newPriority = getPathPriority(pathType as any);
              
              if (newPriority > existingPriority || 
                  (newPriority === existingPriority && nextDepth < (existingNode.distance || Infinity))) {
                existingNode.distance = nextDepth;
                existingNode.path_type = pathType as any;
                existingNode.connection_type = rowType;
                nodeDepthMapRef.current.set(other.id, nextDepth);
              }
            } else {
              // New node
              existingIds.add(other.id);
              addedNodes++;
              nodeDepthMapRef.current.set(other.id, nextDepth);
              nodes.push({
                id: other.id,
                name: other.name,
                preferred_name: other.preferred_name,
                profile_image_url: other.profile_image_url,
                distance: nextDepth,
                connection_type: rowType,
                path_type: pathType as any,
              });
            }
            // Add edge between nodeId and other.id (always add edges, showing all connections)
            const k1 = `${nodeId}__${other.id}`;
            const k2 = `${other.id}__${nodeId}`;
            if (!linkKeys.has(k1) && !linkKeys.has(k2)) {
              linkKeys.add(k1);
              addedLinks++;
              links.push({
                source: nodeId,
                target: other.id,
                how_met: row.how_met,
                connection_type: row.status === "pending" ? "pending" : row.connection_type,
              });
            }
          }
          console.log(
            "[NetworkGraph] Added",
            addedNodes,
            "nodes and",
            addedLinks,
            "links. Total now:",
            nodes.length,
            "nodes,",
            links.length,
            "links"
          );
          const newData = { nodes, links };
          graphDataRef.current = newData;
          return newData;
        });
      } catch (err) {
        console.error("[NetworkGraph] expandNodeNeighbors error:", err);
      }
    },
    [maxDepth]
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
        throw new Error("No user returned from getCurrentUser");
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
      const initialData = {
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
      };
      graphDataRef.current = initialData;
      setGraphData(initialData);
      console.log(
        "[NetworkGraph] Created initial node, calling expandNodeNeighbors"
      );
      await expandNodeNeighbors(user.id);
      console.log("[NetworkGraph] loadNetwork() complete");
    } catch (err) {
      console.error("[NetworkGraph] loadNetwork error:", err);
      // Fallback to test data
      console.log("[NetworkGraph] Using fallback test data");
      const fallbackId = "test-user";
      setCurrentUserId(fallbackId);
      nodeDepthMapRef.current = new Map([[fallbackId, 0]]);
      expandedRef.current = new Set();
      setGraphData({
        nodes: [
          {
            id: fallbackId,
            name: "You",
            preferred_name: "Test User",
            profile_image_url: null,
            distance: 0,
          },
          {
            id: "test-1",
            name: "Connection 1",
            preferred_name: "Friend",
            profile_image_url: null,
            distance: 1,
          },
          {
            id: "test-2",
            name: "Connection 2",
            preferred_name: "Another Friend",
            profile_image_url: null,
            distance: 1,
          },
        ],
        links: [
          { source: fallbackId, target: "test-1", how_met: "School" },
          { source: fallbackId, target: "test-2", how_met: "Work" },
        ],
      });
    } finally {
      setLoading(false);
    }
  }, [expandNodeNeighbors]);

  useEffect(() => {
    loadNetwork();
  }, [loadNetwork]);

  const centerOnMe = () => {
    if (fgRef.current && currentUserId) {
      const myNode = graphData.nodes.find((n) => n.id === currentUserId);
      if (myNode) {
        setCenterPressed(true);
        setTimeout(() => setCenterPressed(false), 200);
        fgRef.current.centerAt(myNode.x, myNode.y, 500);
        fgRef.current.zoom(2, 500);
        console.log("[NetworkGraph] Centered on current user");
      }
    }
  };

  if (loading && !graphData.nodes.length)
    return (
      <div
        ref={containerRef}
        className="flex items-center justify-center w-full bg-gray-900"
        style={{ height: "calc(100vh - 140px)" }}
      >
        <div className="text-xl text-gray-400">Loading network...</div>
      </div>
    );

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-gray-900"
      style={{
        height: "calc(100vh - 140px)",
        minHeight: "500px",
        position: "relative",
      }}
    >
      <div className="absolute inset-0 z-0">
        {dims.w > 0 && dims.h > 0 ? (
          <>
            {console.log(
              "[NetworkGraph] Rendering ForceGraph2D with dims:",
              dims
            )}
            <ForceGraph2D
              ref={fgRef}
              width={dims.w}
              height={dims.h}
              backgroundColor="#0f172a"
              graphData={graphData}
              nodeId="id"
              linkSource="source"
              linkTarget="target"
              warmupTicks={100}
              cooldownTime={5000}
              cooldownTicks={300}
              d3VelocityDecay={0.4}
              d3AlphaDecay={0.02}
              enableZoomInteraction
              enableNodeDrag
              enablePanInteraction
              nodeCanvasObject={
                ((
                  node: Record<string, unknown>,
                  ctx: CanvasRenderingContext2D,
                  globalScale: number
                ) => {
                  const n = node as NodeData;
                  const x = (n.x as number) || 0;
                  const y = (n.y as number) || 0;
                  const r = n.id === currentUserId ? 6 : 5;
                  const isHovered = hoveredNode?.id === n.id;

                  // Draw glow effect if hovered
                  if (isHovered) {
                    ctx.beginPath();
                    ctx.arc(x, y, r + 3, 0, 2 * Math.PI);
                    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
                    ctx.fill();

                    ctx.beginPath();
                    ctx.arc(x, y, r + 6, 0, 2 * Math.PI);
                    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
                    ctx.lineWidth = 1 / globalScale;
                    ctx.stroke();
                  }

                  // Draw circle
                  ctx.beginPath();
                  ctx.arc(x, y, r, 0, 2 * Math.PI);
                  ctx.fillStyle = getNodeColor(n);
                  ctx.fill();

                  // Draw border
                  ctx.strokeStyle = "#fff";
                  ctx.lineWidth = 0.5 / globalScale;
                  ctx.stroke();

                  // Draw label only when not hovered
                  if (!isHovered) {
                    const label = n.preferred_name || n.name;
                    const fontSize = 11 / globalScale;
                    ctx.font = `${fontSize}px Sans-Serif`;
                    ctx.textAlign = "center";
                    ctx.textBaseline = "top";
                    ctx.fillStyle = "#fff";
                    ctx.fillText(label, x, y + r + 4);
                  }
                }) as unknown as (
                  node: Record<string, unknown>,
                  ctx: CanvasRenderingContext2D,
                  globalScale: number
                ) => void
              }
              onNodeHover={
                ((node: Record<string, unknown> | null) => {
                  setHoveredNode(node ? (node as NodeData) : null);
                }) as unknown as (node: Record<string, unknown> | null) => void
              }
              linkCanvasObject={
                ((
                  link: Record<string, unknown>,
                  ctx: CanvasRenderingContext2D,
                  globalScale: number
                ) => {
                  const l = link as LinkData & {
                    source: NodeData;
                    target: NodeData;
                  };
                  const fromX = (l.source.x as number) || 0;
                  const fromY = (l.source.y as number) || 0;
                  const toX = (l.target.x as number) || 0;
                  const toY = (l.target.y as number) || 0;
                  const isSelected = selectedLink === l;

                  if (isSelected) {
                    // Draw glow for selected link
                    ctx.strokeStyle = "rgba(59, 130, 246, 0.4)";
                    ctx.lineWidth = 3 / globalScale;
                    ctx.beginPath();
                    ctx.moveTo(fromX, fromY);
                    ctx.lineTo(toX, toY);
                    ctx.stroke();
                  }

                  // Draw main line
                  ctx.strokeStyle = isSelected
                    ? "rgba(59, 130, 246, 1)"
                    : "rgba(255,255,255,0.4)";
                  ctx.lineWidth = isSelected
                    ? 2 / globalScale
                    : 1 / globalScale;
                  ctx.beginPath();
                  ctx.moveTo(fromX, fromY);
                  ctx.lineTo(toX, toY);
                  ctx.stroke();
                }) as unknown as (
                  link: Record<string, unknown>,
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
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            Loading graph... (dims: {dims.w}x{dims.h})
          </div>
        )}
      </div>

      {selectedLink && (
        <div className="absolute top-4 left-4 bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg z-40 max-w-sm">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-bold text-lg">Connection</h3>
            <button
              onClick={() => setSelectedLink(null)}
              className="text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>
          <div className="space-y-2 text-sm">
            <p className="text-gray-600 dark:text-gray-300">
              <strong>How met:</strong>{" "}
              {selectedLink.how_met || "No description"}
            </p>
            {(() => {
              const sourceId =
                typeof selectedLink.source === "string"
                  ? selectedLink.source
                  : (selectedLink.source as NodeData).id;
              const targetId =
                typeof selectedLink.target === "string"
                  ? selectedLink.target
                  : (selectedLink.target as NodeData).id;
              const sourceNode = graphData.nodes.find((n) => n.id === sourceId);
              const targetNode = graphData.nodes.find((n) => n.id === targetId);
              const sourceDistance = sourceNode?.distance || 0;
              const targetDistance = targetNode?.distance || 0;
              const distance = Math.max(sourceDistance, targetDistance) || 1;
              return (
                <p className="text-gray-600 dark:text-gray-300">
                  <strong>Distance:</strong>{" "}
                  {`${distance} ${distance === 1 ? "degree" : "degrees"} away`}
                </p>
              );
            })()}
          </div>
        </div>
      )}

      <div className="absolute top-4 right-4 z-50 flex gap-2 pointer-events-auto">
        <button
          onClick={centerOnMe}
          className={`px-3 py-2 bg-blue-600 text-white rounded shadow transition-transform ${
            centerPressed ? "scale-90" : "hover:scale-105"
          }`}
        >
          Center on Me
        </button>
      </div>
    </div>
  );
}
