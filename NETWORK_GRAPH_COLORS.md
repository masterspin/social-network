# Network Graph Color Scheme Update

## Overview
Updated the network graph to use a hierarchical color scheme based on connection paths. The color of each node is determined by the shortest path (based on connection type hierarchy) from the user to that node.

## Color Hierarchy

### Connection Type Priority (BFS)
1. **1st connections** (highest priority)
2. **1.5 connections** (medium priority)
3. **Pending connections** (lowest priority)

When a node can be reached via multiple paths, the color is determined by the path with the highest priority.

## Color Scheme

### Direct Connections (Distance 1)

1. **Current User** - `#3b82f6` (Blue)
   - The logged-in user is always shown in blue

2. **1st Connections** - `#10b981` (Green)
   - Direct connections with "first" type

3. **1.5 Connections** - `#a855f7` (Purple)
   - Direct connections with "one_point_five" type

4. **Pending Connections** - `#eab308` (Yellow)
   - Connections awaiting acceptance
   - **Important:** Connections of pending connections are NOT shown

### Indirect Connections (Distance 2+)

#### Via 1st Connection Path (Green → Gray)
- **Distance 2**: `#22c55e` (Lighter green)
- **Distance 3**: `#4ade80` (Light green)
- **Distance 4**: `#86efac` (Very light green)
- **Distance 5**: `#a8a29e` (Green-gray)
- **Distance 6+**: `#78716c` (Gray)

#### Via 1.5 Connection Path (Purple → Gray)
- **Distance 2**: `#c084fc` (Lighter purple)
- **Distance 3**: `#d8b4fe` (Very light purple)
- **Distance 4**: `#c4b5fd` (Light purple-gray)
- **Distance 5**: `#a8a29e` (Purple-gray)
- **Distance 6+**: `#78716c` (Gray)

## Implementation Details

### Path Tracking
- Each node tracks both `connection_type` (its direct connection type) and `path_type` (how it was reached)
- The `path_type` is inherited from the parent node in the BFS traversal
- For direct connections from the user (distance 1), `path_type` equals `connection_type`

### Hierarchy Logic
When a node can be reached via multiple paths:
1. Calculate priority for each path type (first=3, one_point_five=2, pending=1)
2. Choose the path with higher priority
3. If priorities are equal, choose the shorter distance
4. Update the node's `path_type` and `distance` accordingly

### Edge Display
- **All edges are shown** between visible nodes, not just the BFS tree
- This means you can see connections between your connections
- Edges are added whenever we discover a connection during expansion

### Pending Connection Behavior
- Pending connections appear as yellow nodes
- Their connections are **NOT expanded** or shown
- This prevents cluttering the graph with unconfirmed relationships

## Files Modified

### components/NetworkGraph.tsx
- Added `path_type` field to `NodeData` type
- Updated `getNodeColor()` to use path-based gradients
- Modified `expandNodeNeighbors()` to:
  - Track path type when adding nodes
  - Implement hierarchy when nodes can be reached via multiple paths
  - Skip expansion of pending connections
  - Show all edges between visible nodes

### components/NetworkGraph.clean.tsx
- Added `path_type` field to `NodeData` type
- Updated `getNodeColor()` to match main version

### app/api/connections/accepted/route.ts
- Returns both accepted AND pending connections
- Includes `status` field in response

## Visual Hierarchy

The color scheme creates a clear visual hierarchy showing your network structure:

- **Blue** (You) → Center of your network
- **Green** (1st) → Your closest direct connections
- **Purple** (1.5) → Downgraded connections
- **Yellow** (Pending) → Awaiting confirmation
- **Green-to-Gray** → Extended network via 1st connections, fading with distance
- **Purple-to-Gray** → Extended network via 1.5 connections, fading with distance

This makes it easy to understand not just who is in your network, but also how you're connected to them and the strength of those connection paths.
