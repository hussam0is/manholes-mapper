# Canvas Rendering Performance Audit -- Zoom-Out Latency

**Date:** 2026-03-01
**Branch:** dev
**Scope:** HTML5 Canvas rendering pipeline performance when zoomed out with many visible nodes/edges

## Executive Summary

Profiling the rendering pipeline for the zoom-out case where 78+ nodes and 56+ edges are all visible on screen. Identified and fixed 11 performance bottlenecks that collectively reduce per-frame work by eliminating unnecessary object allocations, redundant DOM queries, excessive canvas state changes, and wasted draw calls for invisible details.

## Bottlenecks Identified

### 1. Object Allocation in drawEdge() -- stretchedNode() Spread (HIGH IMPACT)

**File:** `src/legacy/main.js` -- `drawEdge()` and `stretchedNode()`

**Problem:** Every `drawEdge()` call invoked `stretchedNode()` twice (once for tail, once for head), which creates a new object via the spread operator `{ ...node, x: ..., y: ... }`. With 56 edges, this creates 112 short-lived objects per frame, causing GC pressure. Additionally, a heavyweight options object was created per edge for `drawEdgeFeature()`.

**Fix:** Inlined the stretch math directly in `drawEdge()` using local variables (`tx1`, `ty1`, `tx2`, `ty2`) instead of creating spread copies. Inlined the `drawEdgeFeature()` logic for the common case (both nodes present) to avoid creating the options object. The fallback path (missing node) still uses the original functions.

**Impact:** Eliminates ~112 object allocations + ~56 options objects per frame.

### 2. getBoundingClientRect() in drawInfiniteGrid() (MEDIUM IMPACT)

**File:** `src/features/rendering.js` -- `drawInfiniteGrid()`

**Problem:** Called `canvas.getBoundingClientRect()` every frame to get screen dimensions. This forces a layout reflow on the browser, which is expensive (~0.1-0.5ms per call).

**Fix:** Added optional `screenW`/`screenH` parameters. The call site in `draw()` now passes pre-computed logical dimensions (`canvasLogicalW`, `canvasLogicalH`) which are already computed once per frame.

**Impact:** Eliminates 1 forced layout reflow per frame.

### 3. console.debug() in drawMapTiles() Hot Path (MEDIUM IMPACT)

**File:** `src/map/govmap-layer.js` -- `drawMapTiles()`

**Problem:** Three `console.debug()` calls per frame, one of which created a large object literal with 8 properties. Even when the console is not open, `console.debug()` still evaluates all arguments and creates the string representation, causing allocation overhead.

**Fix:** Removed all `console.debug()` calls from the hot rendering path.

**Impact:** Eliminates 3 function calls + 1 object allocation per frame.

### 4. showToast() on Every Wheel Event (MEDIUM IMPACT)

**File:** `src/legacy/main.js` -- wheel event handler

**Problem:** `showToast()` was called on every `wheel` event, which fires at 60Hz during trackpad/mouse scrolling. Each call performs DOM manipulation (`getElementById`, `classList.add`, `clearTimeout`, `setTimeout`), causing layout thrashing during rapid zoom.

**Fix:** Throttled the zoom toast to fire at most once per 120ms using a debounce timer. The toast still appears during zoom but doesn't cause per-event DOM churn.

**Impact:** Reduces DOM operations from 60/sec to ~8/sec during continuous zooming.

### 5. getBoundingClientRect() in Touch Handlers (MEDIUM IMPACT)

**File:** `src/legacy/main.js` -- touchstart and touchmove handlers

**Problem:** Both handlers called `canvas.getBoundingClientRect()` on every touch event. During pinch-zoom, touchmove fires at 60Hz, causing a forced layout reflow per event.

**Fix:** Replaced with `getCachedCanvasRect()` which returns a cached rect (invalidated on resize). The cache was already implemented but not used in these handlers.

**Impact:** Eliminates 60+ forced layout reflows per second during pinch-zoom.

### 6. getBoundingClientRect() in Wheel Handler (LOW IMPACT)

**File:** `src/legacy/main.js` -- wheel event handler

**Problem:** Called `canvas.getBoundingClientRect()` on every wheel event.

**Fix:** Replaced with `getCachedCanvasRect()`.

**Impact:** Eliminates 1 layout reflow per wheel event.

### 7. No LOD for Edge Decorations (HIGH IMPACT when zoomed out)

**File:** `src/legacy/main.js` -- `drawEdge()`

**Problem:** Fall depth icons and mid-arrow decorations were drawn for every edge regardless of zoom level. When zoomed out far (`sizeVS > 3`, meaning elements are < 33% of their normal screen size), these decorations are invisible (sub-pixel) but still consume draw calls: each fall icon requires `save/restore`, `beginPath/arc/fill`, `drawImage`, and each mid-arrow requires `beginPath/moveTo/lineTo/closePath/fill`.

**Fix:** Added early return when `sizeVS > 3` (elements are very small on screen), skipping fall icons and mid-arrows entirely.

**Impact:** Eliminates up to ~56 complex draw operations per frame when zoomed out.

### 8. No LOD for Node Labels (HIGH IMPACT when zoomed out)

**File:** `src/legacy/main.js` -- label rendering in `draw()`

**Problem:** Node labels were drawn at all zoom levels even when the effective font size on screen would be < 4 pixels (unreadable). Each label requires `fillText()` and optionally `strokeText()` (halo), plus `save/restore` per label.

**Fix:** Skip all label rendering when `effectiveFontPx < 4` (font size * viewScale). Also eliminated per-label `save/restore` by setting shared canvas state once before the loop.

**Impact:** Eliminates ~78 `save/restore` + text draw calls per frame when deeply zoomed out. Even at normal zoom, reducing save/restore eliminates canvas state stack operations.

### 9. No LOD for Edge Labels (HIGH IMPACT when zoomed out)

**File:** `src/legacy/main.js` -- edge label rendering in `draw()`

**Problem:** Similar to node labels -- edge measurement labels were drawn when they'd be < 4px on screen.

**Fix:** Added effective font size check (`edgeLabelFontEffective >= 4`) before entering the edge label loop.

**Impact:** Eliminates ~112 text draw calls per frame when zoomed out.

### 10. Simplified Node Icons at Low Zoom (HIGH IMPACT when zoomed out)

**File:** `src/features/node-icons.js` -- `drawNodeIcon()`

**Problem:** Detailed node icons (manholes with crosshatch, drainage with bezier teardrops, covered manholes with clip+stripes, homes with house shapes) were drawn at all zoom levels. Each detailed icon involves 5-15 canvas operations including save/restore, multiple beginPath/stroke/fill, bezier curves, and clipping. When zoomed out, nodes are tiny dots on screen.

**Fix:** When `viewScale > 3` (nodes are < 33% of screen size), draw a simple filled circle/rectangle instead of detailed icons. Coordinate status indicators are also skipped at this zoom level (`viewScale > 2.5`).

**Impact:** Reduces per-node canvas operations from ~10-15 to ~3 when zoomed out, saving ~600+ canvas calls per frame for 78 nodes.

### 11. Background Sketch Edge Batching (HIGH IMPACT in project canvas mode)

**File:** `src/project/project-canvas-renderer.js` -- `drawBackgroundSketches()`

**Problem:** In project canvas mode, background sketch edges were drawn with individual `beginPath/stroke` and `beginPath/fill` calls per edge. With multiple background sketches containing hundreds of edges total, this creates hundreds of individual draw calls.

**Fix:** Batched edges into 3 color groups (primary, drainage, secondary). All line segments in a group are collected into a single path and drawn with one `stroke()` call. Arrow triangles are similarly batched into one `fill()` call per color group.

**Impact:** Reduces draw calls from O(edges * 2) to O(6) (3 strokes + 3 fills) for background sketches.

### 12. Label Collision Detection -- sqrt Elimination (LOW IMPACT)

**File:** `src/utils/label-collision.js` -- `processLabels()`

**Problem:** For each label, nearby nodes were filtered using `Math.sqrt(dx*dx + dy*dy)` comparison, plus `.filter().map()` which creates intermediate arrays. With 78 labels and 78 nodes, this is 6084 sqrt calls per frame.

**Fix:** Replaced with distance-squared comparison (`distSq < searchRadiusSq`) and manual loop with direct push (no intermediate arrays).

**Impact:** Eliminates ~6000 `Math.sqrt()` calls and 2 intermediate array allocations per frame.

## Metrics Summary

| Optimization | Objects/Calls Eliminated Per Frame | Zoom-Out Benefit |
|---|---|---|
| Inline edge stretch | ~168 object allocations | Medium |
| drawNode stretch | ~78 object allocations | Medium |
| Grid getBoundingClientRect | 1 layout reflow | Medium |
| Map debug logs | 3 function calls + 1 object | Low |
| Throttle zoom toast | ~52 DOM ops/sec | Medium |
| Touch getBoundingClientRect | 60+ layout reflows/sec | High on mobile |
| Edge decoration LOD | ~56 complex draws | High at low zoom |
| Node label LOD | ~78 save/restore + text draws | High at low zoom |
| Edge label LOD | ~112 text draws | High at low zoom |
| Simplified node icons | ~600+ canvas operations | Very High at low zoom |
| Background edge batching | ~hundreds of draw calls | High in project mode |
| Label sqrt elimination | ~6000 sqrt calls | Low |

## Testing

- All 771 unit/integration tests pass (`npm run test:run`)
- 0 lint errors (`npm run lint`)
- APP_VERSION bumped from v92 to v93

## Files Modified

- `src/legacy/main.js` -- Edge drawing, node drawing, zoom handling, label rendering, touch events
- `src/features/rendering.js` -- Grid drawing (optional pre-computed dimensions)
- `src/features/node-icons.js` -- LOD for node icons and coordinate indicators
- `src/utils/label-collision.js` -- Distance-squared optimization
- `src/map/govmap-layer.js` -- Removed hot-path console.debug
- `src/project/project-canvas-renderer.js` -- Batched background edge rendering
- `public/service-worker.js` -- APP_VERSION v92 -> v93
