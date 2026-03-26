/**
 * canvas-draw.js
 *
 * Extracted canvas drawing functions from src/legacy/main.js.
 *
 * Reads/writes main.js local state through the shared S proxy (getters/setters).
 * Calls cross-module functions through the shared F registry.
 *
 * All drawing functions that render to the HTML canvas are collected here:
 * draw(), scheduleDraw(), drawEdge(), drawNode(), drawEdgeLabels(), etc.
 */

import { S, F } from './shared-state.js';
import {
  NODE_RADIUS,
  COLORS,
  EDGE_TYPE_COLORS,
} from '../state/constants.js';
import {
  drawGnssMarker,
  gnssState,
} from '../gnss/index.js';
import {
  getMapReferencePoint,
  drawMapTiles,
  drawMapAttribution,
} from '../map/govmap-layer.js';
import {
  drawHouse as primitivesDrawHouse,
  drawDirectConnectionBadge as primitivesDrawDirectConnectionBadge,
} from '../features/drawing-primitives.js';
import {
  drawInfiniteGrid as drawInfiniteGridFeature,
  renderEdgeLegend as renderEdgeLegendFeature,
  drawEdge as drawEdgeFeature,
} from '../features/rendering.js';
import { drawNodeIcon } from '../features/node-icons.js';
import { processLabels } from '../utils/label-collision.js';
import { buildNodeGrid, buildEdgeGrid } from '../utils/spatial-grid.js';
import { renderPerf } from '../utils/render-perf.js';
import { progressiveRenderer } from '../utils/progressive-renderer.js';
import { drawReferenceLayers } from '../map/reference-layers.js';
import { drawBackgroundSketches, drawMergeModeOverlay } from '../project/project-canvas-renderer.js';
import { drawIssueHighlight } from '../project/issue-highlight.js';
import { getEffectiveDpr, getFrameBudgetMs } from '../utils/device-perf.js';

// ── Performance debug ────────────────────────────────────────
let _perfDebug = false;
Object.defineProperty(window, '__perfDebug', {
  get() { return _perfDebug; },
  set(v) { _perfDebug = !!v; _perfDrawFrameCount = 0; },
});
let _perfDrawFrameCount = 0;

// ── Module-local mutable state (throttle flags, caches) ─────
let _edgeLegendDirty = false;
let _incompleteEdgeDirty = false;

// ============================================
// Main draw loop
// ============================================

function draw() {
  const _perfLogThisFrame = _perfDebug && _perfDrawFrameCount < 5;
  if (_perfLogThisFrame) console.time(`[PERF] draw() frame #${_perfDrawFrameCount}`);
  _perfDrawFrameCount++;
  renderPerf.frameStart();

  // Destructure state from S for perf (avoid repeated proxy lookups)
  const {
    canvas, ctx, nodes, edges, selectedNode, selectedEdge,
    currentMode, pendingEdgeTail, pendingEdgeStartPosition, pendingEdgePreview,
    viewScale, viewTranslate, viewStretchX, viewStretchY,
    sizeScale, autoSizeEnabled, coordinateScale,
    highlightedHalfEdge, coordinatesEnabled, coordinatesMap,
    liveMeasureEnabled, mapLayerEnabled,
    isDraggingDanglingEnd, danglingSnapTarget,
    hoveredDanglingEndpoint, draggingDanglingEdge, draggingDanglingType,
    fallIconImage, fallIconReady,
    nodeMap,
    _animatingNodes, _animatingEdges,
    ANIM_NODE_DURATION, ANIM_EDGE_DURATION,
    _issueNodeIds, _issueEdgeIds,
  } = S;

  // When autoSize is enabled, divide sizes by viewScale for constant screen-pixel size
  let sizeVS = autoSizeEnabled ? viewScale : 1;
  S.sizeVS = sizeVS;

  // High-contrast mode: thicker lines and larger labels in dark mode
  const _isDarkFrame = (window.CONSTS && window.CONSTS.isDarkMode());
  const _contrastMul = _isDarkFrame ? 1.5 : 1.0;
  S._isDarkFrame = _isDarkFrame;
  S._contrastMul = _contrastMul;

  // Rebuild fast node lookup map only when nodes changed
  if (S._nodeMapDirty) {
    nodeMap.clear();
    for (let i = 0; i < nodes.length; i++) {
      nodeMap.set(String(nodes[i].id), nodes[i]);
    }
    S._nodeMapDirty = false;
    // Invalidate issue cache when node map changes
    S._issueSetsDirty = true;
  }

  // Recompute issue sets for persistent canvas indicators.
  if (S._issueSetsDirty && typeof window.__computeSketchIssues === 'function') {
    if (_perfLogThisFrame) console.time('[PERF] draw:computeSketchIssues');
    const { issues } = window.__computeSketchIssues(nodes, edges);
    _issueNodeIds.clear();
    _issueEdgeIds.clear();
    for (const issue of issues) {
      if (issue.nodeId != null) _issueNodeIds.add(String(issue.nodeId));
      if (issue.edgeId != null) _issueEdgeIds.add(String(issue.edgeId));
    }
    S._issueSetsDirty = false;
    if (_perfLogThisFrame) console.timeEnd('[PERF] draw:computeSketchIssues');
  }

  // Cache heatmap state once per frame
  const _isHeatmapFrame = document.body.classList.contains('heatmap-active');
  S._isHeatmapFrame = _isHeatmapFrame;

  // Schematic view: sketch has nodes but no survey coordinates attached
  const isSchematicView = nodes.length > 0 && coordinatesMap.size === 0;

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  // Use capped DPR to reduce GPU memory on high-DPR mobile devices (e.g. Galaxy Note 10 DPR 2.625 → 2.0)
  const dpr = getEffectiveDpr();
  const canvasLogicalW = canvas.width / dpr;
  const canvasLogicalH = canvas.height / dpr;

  // Draw map tiles as background layer
  if (mapLayerEnabled && getMapReferencePoint()) {
    ctx.save();
    ctx.translate(viewTranslate.x, viewTranslate.y);
    ctx.scale(viewScale * viewStretchX, viewScale * viewStretchY);
    drawMapTiles(
      ctx,
      canvasLogicalW,
      canvasLogicalH,
      viewTranslate,
      viewScale,
      coordinateScale,
      () => scheduleDraw(),
      viewStretchX,
      viewStretchY
    );
    ctx.restore();
  }

  drawInfiniteGrid(canvasLogicalW, canvasLogicalH, isSchematicView);
  ctx.translate(viewTranslate.x, viewTranslate.y);
  ctx.scale(viewScale, viewScale);

  drawReferenceLayers(
    ctx,
    coordinateScale,
    viewScale,
    viewStretchX,
    viewStretchY,
    viewTranslate,
    canvasLogicalW,
    canvasLogicalH
  );
  const cullMargin = 100 / viewScale;
  const visMinX = -viewTranslate.x / viewScale - cullMargin;
  const visMinY = -viewTranslate.y / viewScale - cullMargin;
  const visMaxX = (canvasLogicalW - viewTranslate.x) / viewScale + cullMargin;
  const visMaxY = (canvasLogicalH - viewTranslate.y) / viewScale + cullMargin;

  // Rebuild spatial grids when data changes
  const nodeRadius = NODE_RADIUS * sizeScale / sizeVS;
  let _nodeGrid = S._nodeGrid;
  let _edgeGrid = S._edgeGrid;
  if (S._spatialGridDirty || !_nodeGrid) {
    _nodeGrid = buildNodeGrid(nodes, nodeRadius, viewStretchX, viewStretchY);
    _edgeGrid = buildEdgeGrid(edges, nodeMap, viewStretchX, viewStretchY);
    S._nodeGrid = _nodeGrid;
    S._edgeGrid = _edgeGrid;
    S._spatialGridDirty = false;
  }

  // Draw background sketches in project-canvas mode
  if (window.__projectCanvas?.isProjectCanvasMode()) {
    const drawOpts = {
      sizeScale,
      viewScale: sizeVS,
      viewStretchX,
      viewStretchY,
      visMinX, visMinY, visMaxX, visMaxY,
      selectedIds: F.getSelectedSketchIds(),
    };
    if (_perfLogThisFrame) console.time('[PERF] draw:backgroundSketches');
    drawBackgroundSketches(ctx, window.__projectCanvas.getBackgroundSketches(), drawOpts);
    if (_perfLogThisFrame) console.timeEnd('[PERF] draw:backgroundSketches');
    drawMergeModeOverlay(ctx, nodes, drawOpts);
  }

  // Draw edges — use spatial grid culling for any non-trivial sketch (50+ edges)
  const _useGridCull = edges.length > 50 && _edgeGrid;
  const _visibleEdges = _useGridCull
    ? _edgeGrid.queryArray(visMinX, visMinY, visMaxX, visMaxY)
    : edges;
  let _edgesDrawn = 0;
  const _useProgressiveEdges = _visibleEdges.length > 500;
  if (_useProgressiveEdges) {
    const viewCenterX = (visMinX + visMaxX) / 2;
    const viewCenterY = (visMinY + visMaxY) / 2;
    progressiveRenderer.begin(_visibleEdges, viewCenterX, viewCenterY, (edge) => {
      const tn = edge.tail != null ? nodeMap.get(String(edge.tail)) : null;
      const hn = edge.head != null ? nodeMap.get(String(edge.head)) : null;
      if (tn && hn) return { x: (tn.x + hn.x) * 0.5 * viewStretchX, y: (tn.y + hn.y) * 0.5 * viewStretchY };
      return { x: 0, y: 0 };
    });
    while (progressiveRenderer.hasMore()) {
      const edge = progressiveRenderer.next();
      const tn = edge.tail != null ? nodeMap.get(String(edge.tail)) : null;
      const hn = edge.head != null ? nodeMap.get(String(edge.head)) : null;
      if ((tn && tn._hidden) || (hn && hn._hidden)) continue;
      drawEdge(edge);
      _edgesDrawn++;
      if (progressiveRenderer.overBudget()) break;
    }
    progressiveRenderer.finish();
    if (!progressiveRenderer.isComplete) scheduleDraw();
  } else {
    for (let i = 0; i < _visibleEdges.length; i++) {
      const edge = _visibleEdges[i];
      const tn = edge.tail != null ? nodeMap.get(String(edge.tail)) : null;
      const hn = edge.head != null ? nodeMap.get(String(edge.head)) : null;
      if ((tn && tn._hidden) || (hn && hn._hidden)) continue;
      if (!_useGridCull && tn && hn) {
        const sx1 = tn.x * viewStretchX, sy1 = tn.y * viewStretchY;
        const sx2 = hn.x * viewStretchX, sy2 = hn.y * viewStretchY;
        const eMinX = Math.min(sx1, sx2), eMaxX = Math.max(sx1, sx2);
        const eMinY = Math.min(sy1, sy2), eMaxY = Math.max(sy1, sy2);
        if (eMaxX < visMinX || eMinX > visMaxX || eMaxY < visMinY || eMinY > visMaxY) continue;
      }
      drawEdge(edge);
      _edgesDrawn++;
    }
  }

  // Rubber-band preview when creating an edge
  if (currentMode === 'edge' && pendingEdgePreview) {
    let x1, y1, x2, y2;
    if (pendingEdgeTail) {
      x1 = pendingEdgeTail.x * viewStretchX;
      y1 = pendingEdgeTail.y * viewStretchY;
      x2 = pendingEdgePreview.x * viewStretchX;
      y2 = pendingEdgePreview.y * viewStretchY;
    } else if (pendingEdgeStartPosition) {
      x1 = pendingEdgeStartPosition.x * viewStretchX;
      y1 = pendingEdgeStartPosition.y * viewStretchY;
      x2 = pendingEdgePreview.x * viewStretchX;
      y2 = pendingEdgePreview.y * viewStretchY;
    } else {
      x1 = x2 = y1 = y2 = 0;
    }
    ctx.save();
    ctx.strokeStyle = COLORS.edge.preview;
    ctx.fillStyle = COLORS.edge.preview;
    ctx.setLineDash([6 / sizeVS, 4 / sizeVS]);
    ctx.lineWidth = 2 / sizeVS;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const arrowLength = 10 / sizeVS;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - arrowLength * Math.cos(angle - Math.PI / 6),
      y2 - arrowLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      x2 - arrowLength * Math.cos(angle + Math.PI / 6),
      y2 - arrowLength * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
    if (pendingEdgeStartPosition) {
      const circleRadius = 5 * sizeScale / sizeVS;
      ctx.beginPath();
      ctx.arc(x1, y1, circleRadius, 0, Math.PI * 2);
      ctx.strokeStyle = COLORS.edge.preview;
      ctx.lineWidth = 1.5 / sizeVS;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Snap indicator during dangling endpoint drag
  if (isDraggingDanglingEnd && danglingSnapTarget) {
    ctx.save();
    let snapX, snapY;
    if (danglingSnapTarget.type === 'node') {
      snapX = danglingSnapTarget.node.x * viewStretchX;
      snapY = danglingSnapTarget.node.y * viewStretchY;
    } else {
      const pos = danglingSnapTarget.danglingType === 'outbound'
        ? danglingSnapTarget.edge.danglingEndpoint : danglingSnapTarget.edge.tailPosition;
      if (pos) { snapX = pos.x * viewStretchX; snapY = pos.y * viewStretchY; }
    }
    if (snapX != null && snapY != null) {
      const snapRadius = 18 * sizeScale / sizeVS;
      ctx.setLineDash([4 / sizeVS, 3 / sizeVS]);
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2.5 / sizeVS;
      ctx.beginPath();
      ctx.arc(snapX, snapY, snapRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  // Draw nodes on top and collect label data
  const labelData = [];
  const nodeData = [];

  // Use spatial grid culling for any non-trivial sketch (50+ nodes)
  const _useNodeGrid = nodes.length > 50 && _nodeGrid;
  const _visibleNodes = _useNodeGrid
    ? _nodeGrid.queryArray(visMinX, visMinY, visMaxX, visMaxY)
    : nodes;
  let _nodesDrawn = 0;

  // For very large visible node sets, use progressive rendering to stay in frame budget
  const _useProgressiveNodes = _visibleNodes.length > 500;
  if (_useProgressiveNodes) {
    const viewCenterX = (visMinX + visMaxX) / 2;
    const viewCenterY = (visMinY + visMaxY) / 2;
    progressiveRenderer.begin(_visibleNodes, viewCenterX, viewCenterY, (node) => ({
      x: node.x * viewStretchX,
      y: node.y * viewStretchY,
    }));
    while (progressiveRenderer.hasMore()) {
      const node = progressiveRenderer.next();
      if (node._hidden) continue;
      const label = drawNode(node);
      if (label) labelData.push(label);
      const sx = node.x * viewStretchX;
      const sy = node.y * viewStretchY;
      nodeData.push({ x: sx, y: sy, radius: nodeRadius });
      _nodesDrawn++;
      if (progressiveRenderer.overBudget()) break;
    }
    progressiveRenderer.finish();
    if (!progressiveRenderer.isComplete) scheduleDraw();
  } else {
    for (let i = 0; i < _visibleNodes.length; i++) {
      const node = _visibleNodes[i];
      if (node._hidden) continue;
      const sx = node.x * viewStretchX;
      const sy = node.y * viewStretchY;
      if (!_useNodeGrid) {
        if (sx + nodeRadius < visMinX || sx - nodeRadius > visMaxX ||
            sy + nodeRadius < visMinY || sy - nodeRadius > visMaxY) {
          continue;
        }
      }
      const label = drawNode(node);
      if (label) {
        labelData.push(label);
      }
      nodeData.push({ x: sx, y: sy, radius: nodeRadius });
      _nodesDrawn++;
    }
  }

  renderPerf.record('visibleNodes', _nodesDrawn);
  renderPerf.record('visibleEdges', _edgesDrawn);
  renderPerf.record('totalNodes', nodes.length);
  renderPerf.record('totalEdges', edges.length);

  // Edge label data cache
  let _edgeLabelDataCache = S._edgeLabelDataCache;
  const _quantizedSizeVS = Math.round(sizeVS * 100) / 100;
  if (
    _edgeLabelDataCache === null ||
    S._edgeLabelCacheStretchX !== viewStretchX ||
    S._edgeLabelCacheStretchY !== viewStretchY ||
    S._edgeLabelCacheSizeScale !== sizeScale ||
    S._edgeLabelCacheViewScale !== _quantizedSizeVS
  ) {
    _edgeLabelDataCache = [];
    S._edgeLabelCacheStretchX = viewStretchX;
    S._edgeLabelCacheStretchY = viewStretchY;
    S._edgeLabelCacheSizeScale = sizeScale;
    S._edgeLabelCacheViewScale = _quantizedSizeVS;
    edges.forEach((edge) => {
      const tailNode = edge.tail != null ? nodeMap.get(String(edge.tail)) : undefined;
      const headNode = edge.head != null ? nodeMap.get(String(edge.head)) : undefined;

      let x1, y1, x2, y2;
      if (tailNode && headNode) {
        x1 = tailNode.x * viewStretchX; y1 = tailNode.y * viewStretchY;
        x2 = headNode.x * viewStretchX; y2 = headNode.y * viewStretchY;
      } else if (tailNode && !headNode && edge.danglingEndpoint) {
        x1 = tailNode.x * viewStretchX; y1 = tailNode.y * viewStretchY;
        x2 = edge.danglingEndpoint.x * viewStretchX; y2 = edge.danglingEndpoint.y * viewStretchY;
      } else if (!tailNode && headNode && edge.tailPosition) {
        x1 = edge.tailPosition.x * viewStretchX; y1 = edge.tailPosition.y * viewStretchY;
        x2 = headNode.x * viewStretchX; y2 = headNode.y * viewStretchY;
      } else {
        return;
      }
      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length <= 0) return;

      const normX = dx / length;
      const normY = dy / length;
      const offset = 6 * sizeScale / _quantizedSizeVS;
      const fontSize = Math.round(14 * sizeScale / _quantizedSizeVS);

      if (edge.tail_measurement) {
        const ratio = 0.25;
        const px = x1 + dx * ratio;
        const py = y1 + dy * ratio;
        const perpX = -normY * offset;
        const perpY = normX * offset;
        _edgeLabelDataCache.push({
          text: String(edge.tail_measurement),
          x: px + perpX,
          y: py + perpY,
          fontSize: fontSize
        });
      }

      if (edge.head_measurement) {
        const ratio = 0.75;
        const px = x1 + dx * ratio;
        const py = y1 + dy * ratio;
        const perpX = -normY * offset;
        const perpY = normX * offset;
        _edgeLabelDataCache.push({
          text: String(edge.head_measurement),
          x: px + perpX,
          y: py + perpY,
          fontSize: fontSize
        });
      }
    });
    S._edgeLabelDataCache = _edgeLabelDataCache;
  }
  const edgeLabelData = _edgeLabelDataCache;

  // Process labels
  const LABEL_COLLISION_THRESHOLD = 120;
  let positionedLabels;
  if (labelData.length <= LABEL_COLLISION_THRESHOLD) {
    positionedLabels = processLabels(ctx, labelData, nodeData, edgeLabelData);
  } else {
    positionedLabels = labelData.map(l => ({
      text: l.text,
      x: l.nodeX,
      y: l.nodeY - l.nodeRadius * 1.1,
      align: 'center',
      baseline: 'bottom',
      fontSize: l.fontSize
    }));
  }

  // Draw positioned labels
  const effectiveFontPx = positionedLabels.length > 0
    ? positionedLabels[0].fontSize * viewScale
    : 16;
  if (effectiveFontPx >= 4 && positionedLabels.length > 0) {
    const useHalo = mapLayerEnabled && getMapReferencePoint();
    ctx.save();
    ctx.fillStyle = COLORS.node.label;
    if (useHalo) {
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.lineWidth = 4 / sizeVS;
      ctx.lineJoin = 'round';
    }
    const uniformFont = positionedLabels.length > 0 ? positionedLabels[0].fontSize : 16;
    const allSameFont = positionedLabels.every(l => l.fontSize === uniformFont);
    if (allSameFont) {
      ctx.font = useHalo ? `bold ${uniformFont}px Arial` : `${uniformFont}px Arial`;
    }
    for (let i = 0; i < positionedLabels.length; i++) {
      const label = positionedLabels[i];
      if (!allSameFont) {
        ctx.font = useHalo ? `bold ${label.fontSize}px Arial` : `${label.fontSize}px Arial`;
      }
      ctx.textAlign = label.align;
      ctx.textBaseline = label.baseline;
      if (useHalo) {
        ctx.strokeText(label.text, label.x, label.y);
      }
      ctx.fillText(label.text, label.x, label.y);
    }
    ctx.restore();
  }

  // Draw edge measurement labels
  {
    const _elf = Math.round(14 * sizeScale / sizeVS) * viewScale;
    if (viewScale >= 0.3 && _elf >= 4) {
      const _edgeLabelSource = _useGridCull
        ? _visibleEdges
        : edges;
      for (let i = 0; i < _edgeLabelSource.length; i++) {
        const edge = _edgeLabelSource[i];
        if (!_useGridCull) {
          const tn = edge.tail != null ? nodeMap.get(String(edge.tail)) : null;
          const hn = edge.head != null ? nodeMap.get(String(edge.head)) : null;
          if (tn && hn) {
            const sx1 = tn.x * viewStretchX, sy1 = tn.y * viewStretchY;
            const sx2 = hn.x * viewStretchX, sy2 = hn.y * viewStretchY;
            if (Math.max(sx1, sx2) < visMinX || Math.min(sx1, sx2) > visMaxX ||
                Math.max(sy1, sy2) < visMinY || Math.min(sy1, sy2) > visMaxY) continue;
          }
        }
        drawEdgeLabels(edge);
      }
    }
  }

  // Draw unified location marker
  if (liveMeasureEnabled && gnssState) {
    const position = gnssState.getPosition();
    const referencePoint = getMapReferencePoint();
    if (position && position.isValid && referencePoint) {
      drawGnssMarker(
        ctx,
        position,
        referencePoint,
        coordinateScale,
        viewTranslate,
        viewScale,
        { isStale: position.isStale, stretchX: viewStretchX, stretchY: viewStretchY }
      );
    }
  }

  drawIssueHighlight(ctx, viewScale, viewStretchX, viewStretchY, viewTranslate);

  if (typeof window.__fcTerritoryOverlay === 'function') {
    window.__fcTerritoryOverlay(ctx, viewScale, viewTranslate, viewStretchX, viewStretchY);
  }

  if (_animatingNodes.size > 0 || _animatingEdges.size > 0) {
    requestAnimationFrame(scheduleDraw);
  }

  ctx.restore();

  if (mapLayerEnabled && getMapReferencePoint()) {
    drawMapAttribution(ctx, canvas.width, canvas.height);
  }

  // Schematic view banner (screen-space overlay)
  if (isSchematicView) {
    drawSchematicBanner(ctx, canvasLogicalW, _isDarkFrame);
  }

  scheduleEdgeLegendUpdate();
  scheduleIncompleteEdgeUpdate();
  renderPerf.frameEnd();
  if (_perfLogThisFrame) console.timeEnd(`[PERF] draw() frame #${_perfDrawFrameCount - 1}`);
}

// ── Throttled DOM updates ────────────────────────────────────

function scheduleEdgeLegendUpdate() {
  if (_edgeLegendDirty) return;
  _edgeLegendDirty = true;
  queueMicrotask(() => {
    _edgeLegendDirty = false;
    renderEdgeLegend();
  });
}

function scheduleIncompleteEdgeUpdate() {
  if (_incompleteEdgeDirty) return;
  _incompleteEdgeDirty = true;
  queueMicrotask(() => {
    _incompleteEdgeDirty = false;
    F.updateIncompleteEdgeTracker();
  });
}

function renderEdgeLegend() {
  const legend = document.getElementById('edgeLegend');
  const toggle = document.getElementById('edgeLegendToggle');
  if (S.edges.length === 0) {
    if (legend) legend.style.display = 'none';
    if (toggle) toggle.style.display = 'none';
    return;
  }
  if (legend) legend.style.removeProperty('display');
  if (toggle) toggle.style.removeProperty('display');
  renderEdgeLegendFeature(legend, EDGE_TYPE_COLORS);
}

// ── Grid / padding / auto-pan ────────────────────────────────

function drawInfiniteGrid(logicalW, logicalH, isSchematicView = false) {
  drawInfiniteGridFeature(S.ctx, S.viewTranslate, S.viewScale, S.canvas, S.viewStretchX, S.viewStretchY, logicalW, logicalH, isSchematicView);
}

function drawSchematicBanner(ctx, logicalW, isDark) {
  const t = typeof window.t === 'function' ? window.t : (k) => k;
  const text = t('schematicView.banner');
  const bannerH = 30;
  const padding = 8;
  ctx.save();
  // Background pill
  ctx.fillStyle = isDark ? 'rgba(148,163,184,0.12)' : 'rgba(100,116,139,0.10)';
  ctx.fillRect(0, 0, logicalW, bannerH);
  // Subtle bottom border
  ctx.strokeStyle = isDark ? 'rgba(148,163,184,0.15)' : 'rgba(100,116,139,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, bannerH);
  ctx.lineTo(logicalW, bannerH);
  ctx.stroke();
  // Icon + text
  ctx.font = '600 12px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = isDark ? 'rgba(148,163,184,0.65)' : 'rgba(71,85,105,0.65)';
  ctx.fillText('◇  ' + text + '  ◇', logicalW / 2, bannerH / 2);
  ctx.restore();
}

function ensureVirtualPadding() {
  const { nodes, viewStretchX, viewStretchY, viewScale, viewTranslate } = S;
  if (nodes.length === 0) return;
  const OUTER = 80;
  const INNER = 140;
  let minScreenX = Infinity;
  let minScreenY = Infinity;
  let maxScreenX = -Infinity;
  let maxScreenY = -Infinity;
  for (const n of nodes) {
    const stretchedX = n.x * viewStretchX;
    const stretchedY = n.y * viewStretchY;
    const sx = stretchedX * viewScale + viewTranslate.x;
    const sy = stretchedY * viewScale + viewTranslate.y;
    if (sx < minScreenX) minScreenX = sx;
    if (sy < minScreenY) minScreenY = sy;
    if (sx > maxScreenX) maxScreenX = sx;
    if (sy > maxScreenY) maxScreenY = sy;
  }
  const rect = F.getCachedCanvasRect();
  let dx = 0;
  let dy = 0;
  if (minScreenX < OUTER) dx += INNER - minScreenX;
  if (minScreenY < OUTER) dy += INNER - minScreenY;
  if (maxScreenX > rect.width - OUTER) dx -= maxScreenX - (rect.width - INNER);
  if (maxScreenY > rect.height - OUTER) dy -= maxScreenY - (rect.height - INNER);
  if (dx !== 0 || dy !== 0) {
    viewTranslate.x += dx;
    viewTranslate.y += dy;
  }
}

function autoPanWhenDragging(screenX, screenY) {
  const rect = F.getCachedCanvasRect();
  const EDGE = 80;
  const SPEED = 6;
  let dx = 0;
  let dy = 0;
  if (screenX < EDGE) dx += SPEED;
  if (screenX > rect.width - EDGE) dx -= SPEED;
  if (screenY < EDGE) dy += SPEED;
  if (screenY > rect.height - EDGE) dy -= SPEED;
  if (dx !== 0 || dy !== 0) {
    S.viewTranslate.x += dx * 0.7;
    S.viewTranslate.y += dy * 0.7;
    scheduleDraw();
  }
}

// ── Node type computation ────────────────────────────────────

function computeNodeTypes() {
  const { nodes, edges } = S;
  const nodeMap = new Map();
  for (const node of nodes) {
    node.type = 'type1';
    nodeMap.set(String(node.id), node);
  }
  for (const edge of edges) {
    if (String(edge.tail) === String(edge.head)) continue;
    const tailNode = nodeMap.get(String(edge.tail));
    const headNode = nodeMap.get(String(edge.head));
    if (tailNode && tailNode.maintenanceStatus === 1 && (!edge.tail_measurement || edge.tail_measurement.trim() === '')) {
      tailNode.type = 'type2';
    }
    if (headNode && headNode.maintenanceStatus === 1 && (!edge.head_measurement || edge.head_measurement.trim() === '')) {
      headNode.type = 'type2';
    }
  }
}

// ── Edge drawing ─────────────────────────────────────────────

function drawEdge(edge) {
  const {
    ctx, nodeMap, selectedEdge, viewStretchX, viewStretchY,
    sizeScale, sizeVS, highlightedHalfEdge,
    fallIconImage, fallIconReady,
    _animatingEdges, ANIM_EDGE_DURATION,
    _issueEdgeIds,
  } = S;
  const _contrastMul = S._contrastMul;
  const _isHeatmapFrame = S._isHeatmapFrame;

  const tailNode = edge.tail != null ? nodeMap.get(String(edge.tail)) || null : null;
  const headNode = edge.head != null ? nodeMap.get(String(edge.head)) || null : null;

  if (edge.tail === null && headNode && edge.tailPosition) {
    drawDanglingEdgeLocal(edge, headNode, 'inbound');
    return;
  }
  if (edge.head === null && tailNode && (edge.isDangling || edge.danglingEndpoint)) {
    drawDanglingEdgeLocal(edge, tailNode, 'outbound');
    return;
  }

  const tx1 = tailNode ? tailNode.x * viewStretchX : 0;
  const ty1 = tailNode ? tailNode.y * viewStretchY : 0;
  const tx2 = headNode ? headNode.x * viewStretchX : 0;
  const ty2 = headNode ? headNode.y * viewStretchY : 0;

  const angle = tailNode && headNode ? Math.atan2(ty2 - ty1, tx2 - tx1) : 0;

  if (tailNode && headNode) {
    let resolvedColor;
    if (edge === selectedEdge) {
      resolvedColor = F.diameterToColor(edge.line_diameter) || EDGE_TYPE_COLORS?.[edge.edge_type] || COLORS?.edge?.selected || '#7c3aed';
    } else if (_isHeatmapFrame) {
      const hasBoth = edge.tail_measurement && String(edge.tail_measurement).trim() !== '' &&
                       edge.head_measurement && String(edge.head_measurement).trim() !== '';
      resolvedColor = hasBoth ? '#3b82f6' : '#9ca3af';
    } else {
      resolvedColor = F.diameterToColor(edge.line_diameter) || EDGE_TYPE_COLORS?.[edge.edge_type] || '#555';
    }
    ctx.strokeStyle = resolvedColor;
    const diam = parseFloat(edge.line_diameter);
    const baseLW = (diam > 0) ? 1.5 + Math.min(diam, 2000) / 2000 * 4.5 : 2;
    let edgeLW = (baseLW * _contrastMul) / sizeVS;
    const edgeAnimStart = _animatingEdges.size > 0 ? _animatingEdges.get(edge.id) : undefined;
    if (edgeAnimStart != null) {
      const elapsed = performance.now() - edgeAnimStart;
      if (elapsed < ANIM_EDGE_DURATION) {
        const t = elapsed / ANIM_EDGE_DURATION;
        edgeLW *= 1 + Math.sin(t * Math.PI);
      } else {
        _animatingEdges.delete(edge.id);
      }
    }
    ctx.lineWidth = edgeLW;
    if (edge === selectedEdge) {
      ctx.save();
      ctx.strokeStyle = resolvedColor;
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = edgeLW * 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tx1, ty1);
      ctx.lineTo(tx2, ty2);
      ctx.stroke();
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = edgeLW * 2.2;
      ctx.beginPath();
      ctx.moveTo(tx1, ty1);
      ctx.lineTo(tx2, ty2);
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = resolvedColor;
    }
    ctx.beginPath();
    ctx.moveTo(tx1, ty1);
    ctx.lineTo(tx2, ty2);
    ctx.stroke();
    const arrowLength = 10 / sizeVS;
    const nodeR = NODE_RADIUS * sizeScale / sizeVS;
    const tipX = tx2 - nodeR * Math.cos(angle);
    const tipY = ty2 - nodeR * Math.sin(angle);
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - arrowLength * Math.cos(angle - Math.PI / 6), tipY - arrowLength * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(tipX - arrowLength * Math.cos(angle + Math.PI / 6), tipY - arrowLength * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = resolvedColor;
    ctx.fill();
    if (highlightedHalfEdge && highlightedHalfEdge.edgeId === edge.id) {
      const dx = tx2 - tx1;
      const dy = ty2 - ty1;
      const ratioStart = highlightedHalfEdge.half === 'tail' ? 0.0 : 0.5;
      const ratioEnd = highlightedHalfEdge.half === 'tail' ? 0.5 : 1.0;
      ctx.save();
      ctx.strokeStyle = (COLORS?.edge?.selected || '#7c3aed');
      ctx.lineWidth = 5 / sizeVS;
      ctx.beginPath();
      ctx.moveTo(tx1 + dx * ratioStart, ty1 + dy * ratioStart);
      ctx.lineTo(tx1 + dx * ratioEnd, ty1 + dy * ratioEnd);
      ctx.stroke();
      ctx.restore();
    }

    if (_issueEdgeIds.has(String(edge.id)) && edge !== selectedEdge && sizeVS < 3) {
      ctx.save();
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
      ctx.lineWidth = 4 / sizeVS;
      ctx.setLineDash([6 / sizeVS, 4 / sizeVS]);
      ctx.beginPath();
      ctx.moveTo(tx1, ty1);
      ctx.lineTo(tx2, ty2);
      ctx.stroke();
      ctx.setLineDash([]);

      const midX = (tx1 + tx2) / 2;
      const midY = (ty1 + ty2) / 2;
      const badgeR = 5 / sizeVS;
      ctx.beginPath();
      ctx.arc(midX, midY, badgeR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.88)';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1 / sizeVS;
      ctx.stroke();

      ctx.font = `bold ${badgeR * 1.3}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText('!', midX, midY + badgeR * 0.06);
      ctx.restore();
    }
  } else {
    const stretchedTail = F.stretchedNode(tailNode);
    const stretchedHead = F.stretchedNode(headNode);
    drawEdgeFeature(ctx, edge, stretchedTail, stretchedHead, {
      selectedEdge,
      edgeTypeColors: EDGE_TYPE_COLORS,
      highlightedHalfEdge,
      colors: COLORS,
      viewScale: sizeVS,
    });
    return;
  }
  if (sizeVS > 3) return;
  if (edge.fall_depth !== '' && edge.fall_depth !== null && edge.fall_depth !== undefined) {
    const iconDistanceFromHead = ((typeof NODE_RADIUS === 'number' ? NODE_RADIUS : 20) * sizeScale + 7 * sizeScale) / sizeVS;
    const iconX = tx2 - Math.cos(angle) * iconDistanceFromHead;
    const iconY = ty2 - Math.sin(angle) * iconDistanceFromHead;
    const size = 16 * sizeScale / sizeVS;
    if (fallIconImage && fallIconReady) {
      ctx.save();
      const bgRadius = size * 0.45;
      ctx.beginPath();
      ctx.arc(iconX, iconY, bgRadius, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.edge.fallIconBg;
      ctx.fill();
      ctx.lineWidth = 2 / sizeVS;
      ctx.strokeStyle = COLORS.edge.fallIconStroke;
      ctx.stroke();
      const innerSize = size - (6 * sizeScale / sizeVS);
      ctx.drawImage(fallIconImage, iconX - innerSize / 2, iconY - innerSize / 2, innerSize, innerSize);
      ctx.restore();
    } else {
      const iconRadius = 6 / sizeVS;
      ctx.save();
      ctx.beginPath();
      ctx.arc(iconX, iconY, iconRadius, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.edge.fallIconFallback;
      ctx.fill();
      ctx.lineWidth = 2 / sizeVS;
      ctx.strokeStyle = COLORS.edge.fallIconStroke;
      ctx.stroke();
      ctx.fillStyle = COLORS.edge.fallIconText;
      ctx.font = `bold ${9 / sizeVS}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('F', iconX, iconY);
      ctx.restore();
    }
  }
  const midX = (tx1 + tx2) / 2;
  const midY = (ty1 + ty2) / 2;
  const midArrowLen = 8 / sizeVS;
  ctx.beginPath();
  ctx.moveTo(midX, midY);
  ctx.lineTo(
    midX - midArrowLen * Math.cos(angle - Math.PI / 6),
    midY - midArrowLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    midX - midArrowLen * Math.cos(angle + Math.PI / 6),
    midY - midArrowLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fillStyle = (COLORS.edge.label || '#000');
  ctx.fill();
}

// ── Dangling edge drawing ────────────────────────────────────

function drawDanglingEdgeLocal(edge, connectedNode, type = 'outbound') {
  if (!connectedNode) return;
  const {
    ctx, selectedEdge, viewStretchX, viewStretchY,
    sizeScale, sizeVS,
    hoveredDanglingEndpoint, isDraggingDanglingEnd,
    draggingDanglingEdge, draggingDanglingType,
  } = S;

  const isSelected = edge === selectedEdge;
  const defaultOffset = 80 * sizeScale / sizeVS;
  const stretchedConnected = F.stretchedNode(connectedNode);

  let startX, startY, endX, endY, openEndX, openEndY;

  if (type === 'outbound') {
    startX = stretchedConnected.x;
    startY = stretchedConnected.y;
    const rawEndX = edge.danglingEndpoint?.x ?? (connectedNode.x + defaultOffset);
    const rawEndY = edge.danglingEndpoint?.y ?? (connectedNode.y - defaultOffset * 0.5);
    endX = rawEndX * viewStretchX;
    endY = rawEndY * viewStretchY;
    openEndX = endX;
    openEndY = endY;
  } else {
    const rawStartX = edge.tailPosition?.x ?? (connectedNode.x - defaultOffset);
    const rawStartY = edge.tailPosition?.y ?? (connectedNode.y - defaultOffset * 0.5);
    startX = rawStartX * viewStretchX;
    startY = rawStartY * viewStretchY;
    endX = stretchedConnected.x;
    endY = stretchedConnected.y;
    openEndX = startX;
    openEndY = startY;
  }

  ctx.save();

  const solidColor = isSelected ? '#6b7280' : '#9ca3af';
  const dangDiam = parseFloat(edge.line_diameter);
  const dangBaseLW = (dangDiam > 0) ? 1.5 + Math.min(dangDiam, 2000) / 2000 * 4.5 : 2;

  const dx = endX - startX;
  const dy = endY - startY;
  const totalLength = Math.sqrt(dx * dx + dy * dy);
  const dashLength = 30 * sizeScale / sizeVS;

  if (type === 'outbound') {
    const dashStartLength = Math.max(0, totalLength - dashLength);
    const ratio = totalLength > 0 ? dashStartLength / totalLength : 0;
    const dashStartX = startX + dx * ratio;
    const dashStartY = startY + dy * ratio;

    ctx.strokeStyle = solidColor;
    ctx.lineWidth = dangBaseLW / sizeVS;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(dashStartX, dashStartY);
    ctx.stroke();

    ctx.setLineDash([4 / sizeVS, 4 / sizeVS]);
    ctx.strokeStyle = isSelected ? '#9ca3af' : '#d1d5db';
    ctx.beginPath();
    ctx.moveTo(dashStartX, dashStartY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  } else {
    const dashEndLength = Math.min(dashLength, totalLength);
    const ratio = totalLength > 0 ? dashEndLength / totalLength : 0;
    const dashEndX = startX + dx * ratio;
    const dashEndY = startY + dy * ratio;

    ctx.setLineDash([4 / sizeVS, 4 / sizeVS]);
    ctx.strokeStyle = isSelected ? '#9ca3af' : '#d1d5db';
    ctx.lineWidth = dangBaseLW / sizeVS;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(dashEndX, dashEndY);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.strokeStyle = solidColor;
    ctx.beginPath();
    ctx.moveTo(dashEndX, dashEndY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }

  ctx.setLineDash([]);

  const angle = Math.atan2(dy, dx);
  const midX = (startX + endX) / 2;
  const midY = (startY + endY) / 2;
  const midArrowLen = 8 / sizeVS;
  ctx.beginPath();
  ctx.moveTo(midX, midY);
  ctx.lineTo(
    midX - midArrowLen * Math.cos(angle - Math.PI / 6),
    midY - midArrowLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    midX - midArrowLen * Math.cos(angle + Math.PI / 6),
    midY - midArrowLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fillStyle = (COLORS.edge.label || '#000');
  ctx.fill();

  const isHovered = hoveredDanglingEndpoint &&
    hoveredDanglingEndpoint.edge === edge && hoveredDanglingEndpoint.type === type;
  const isBeingDragged = isDraggingDanglingEnd &&
    draggingDanglingEdge === edge && draggingDanglingType === type;
  const handleActive = isHovered || isBeingDragged;
  const circleRadius = (handleActive ? 8 : 5) * sizeScale / sizeVS;
  ctx.beginPath();
  ctx.arc(openEndX, openEndY, circleRadius, 0, Math.PI * 2);
  if (handleActive) {
    ctx.fillStyle = 'rgba(147, 51, 234, 0.25)';
    ctx.fill();
    ctx.strokeStyle = '#7c3aed';
    ctx.lineWidth = 2 / sizeVS;
  } else {
    ctx.strokeStyle = solidColor;
    ctx.lineWidth = 1.5 / sizeVS;
  }
  ctx.stroke();

  ctx.restore();
}

// ── Edge labels ──────────────────────────────────────────────

function drawEdgeLabels(edge) {
  const {
    ctx, nodeMap, viewStretchX, viewStretchY,
    sizeScale, sizeVS, coordinatesEnabled, coordinatesMap, coordinateScale,
  } = S;
  const _isDarkFrame = S._isDarkFrame;

  const tailNode = edge.tail != null ? nodeMap.get(String(edge.tail)) : undefined;
  const headNode = edge.head != null ? nodeMap.get(String(edge.head)) : undefined;

  let x1, y1, x2, y2;
  if (tailNode && headNode) {
    if (tailNode._hidden || headNode._hidden) return;
    x1 = tailNode.x * viewStretchX; y1 = tailNode.y * viewStretchY;
    x2 = headNode.x * viewStretchX; y2 = headNode.y * viewStretchY;
  } else if (tailNode && !headNode && edge.danglingEndpoint) {
    if (tailNode._hidden) return;
    x1 = tailNode.x * viewStretchX; y1 = tailNode.y * viewStretchY;
    x2 = edge.danglingEndpoint.x * viewStretchX; y2 = edge.danglingEndpoint.y * viewStretchY;
  } else if (!tailNode && headNode && edge.tailPosition) {
    if (headNode._hidden) return;
    x1 = edge.tailPosition.x * viewStretchX; y1 = edge.tailPosition.y * viewStretchY;
    x2 = headNode.x * viewStretchX; y2 = headNode.y * viewStretchY;
  } else {
    return;
  }
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthPx = Math.sqrt(dx * dx + dy * dy);
  if (lengthPx <= 0) return;
  const normX = dx / lengthPx;
  const normY = dy / lengthPx;
  const offset = 6 * sizeScale / sizeVS;
  ctx.save();
  const fontSize = Math.round(14 * sizeScale / sizeVS);
  ctx.font = `${fontSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4 / sizeVS;
  ctx.strokeStyle = COLORS.edge.labelStroke;
  ctx.fillStyle = COLORS.edge.label;

  // Draw length in meters if coordinates are enabled
  if (coordinatesEnabled && coordinatesMap.size > 0) {
    let lengthMeters = null;
    if (tailNode?.surveyX != null && headNode?.surveyX != null) {
      const surveyDx = headNode.surveyX - tailNode.surveyX;
      const surveyDy = headNode.surveyY - tailNode.surveyY;
      lengthMeters = Math.sqrt(surveyDx * surveyDx + surveyDy * surveyDy);
    } else if (coordinateScale > 0) {
      lengthMeters = lengthPx / coordinateScale;
    }

    if (lengthMeters !== null && lengthMeters > 0.01) {
      const lengthText = lengthMeters < 10
        ? `${lengthMeters.toFixed(2)}m`
        : `${lengthMeters.toFixed(1)}m`;

      const ratio = 0.5;
      const px = x1 + dx * ratio;
      const py = y1 + dy * ratio;

      const lengthOffset = 16 * sizeScale / sizeVS;
      const perpX = normY * lengthOffset;
      const perpY = -normX * lengthOffset;

      const lengthFontSize = Math.round(12 * sizeScale / sizeVS);
      ctx.font = `${lengthFontSize}px Arial`;
      ctx.textBaseline = 'middle';

      const labelX = px + perpX;
      const labelY = py + perpY;
      const metrics = ctx.measureText(lengthText);
      const padH = 4 / sizeVS;
      const padV = 3 / sizeVS;
      const bgW = metrics.width + padH * 2;
      const bgH = lengthFontSize + padV * 2;
      const bgX = labelX - bgW / 2;
      const bgY = labelY - bgH / 2;
      const bgR = 3 / sizeVS;
      ctx.fillStyle = _isDarkFrame ? 'rgba(15,23,42,0.75)' : 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.moveTo(bgX + bgR, bgY);
      ctx.lineTo(bgX + bgW - bgR, bgY);
      ctx.quadraticCurveTo(bgX + bgW, bgY, bgX + bgW, bgY + bgR);
      ctx.lineTo(bgX + bgW, bgY + bgH - bgR);
      ctx.quadraticCurveTo(bgX + bgW, bgY + bgH, bgX + bgW - bgR, bgY + bgH);
      ctx.lineTo(bgX + bgR, bgY + bgH);
      ctx.quadraticCurveTo(bgX, bgY + bgH, bgX, bgY + bgH - bgR);
      ctx.lineTo(bgX, bgY + bgR);
      ctx.quadraticCurveTo(bgX, bgY, bgX + bgR, bgY);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = COLORS.edge.labelStroke;
      ctx.fillStyle = '#0369a1';
      ctx.lineWidth = 3 / sizeVS;

      ctx.strokeText(lengthText, labelX, labelY);
      ctx.fillText(lengthText, labelX, labelY);

      ctx.font = `${fontSize}px Arial`;
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = COLORS.edge.label;
      ctx.lineWidth = 4 / sizeVS;
    }
  }

  if (edge.tail_measurement) {
    const ratio = 0.25;
    const px = x1 + dx * ratio;
    const py = y1 + dy * ratio;
    const perpX = -normY * offset;
    const perpY = normX * offset;
    const text = String(edge.tail_measurement);
    ctx.strokeText(text, px + perpX, py + perpY);
    ctx.fillText(text, px + perpX, py + perpY);
  }
  if (edge.head_measurement) {
    const ratio = 0.75;
    const px = x1 + dx * ratio;
    const py = y1 + dy * ratio;
    const perpX = -normY * offset;
    const perpY = normX * offset;
    const text = String(edge.head_measurement);
    ctx.strokeText(text, px + perpX, py + perpY);
    ctx.fillText(text, px + perpX, py + perpY);
  }
  ctx.restore();
}

// ── Node drawing ─────────────────────────────────────────────

function drawNode(node) {
  const {
    ctx, selectedNode, viewStretchX, viewStretchY,
    sizeScale, sizeVS, coordinatesEnabled, coordinatesMap,
    _animatingNodes, ANIM_NODE_DURATION,
    _issueNodeIds,
  } = S;
  const _isHeatmapFrame = S._isHeatmapFrame;

  let radius = NODE_RADIUS * sizeScale / sizeVS;
  const animStart = _animatingNodes.size > 0 ? _animatingNodes.get(String(node.id)) : undefined;
  if (animStart != null) {
    const elapsed = performance.now() - animStart;
    if (elapsed < ANIM_NODE_DURATION) {
      const t = elapsed / ANIM_NODE_DURATION;
      radius *= 1 + 0.1 * Math.sin(t * Math.PI);
    } else {
      _animatingNodes.delete(String(node.id));
    }
  }

  const stretchedN = F.stretchedNodeFast(node);
  const stretchedX = stretchedN.x;
  const stretchedY = stretchedN.y;

  const isSelected = selectedNode && String(selectedNode.id) === String(node.id);

  let heatmapColor = null;
  if (_isHeatmapFrame && !isSelected) {
    const isHome = node.nodeType === 'Home';
    const isForLater = node.nodeType === 'ForLater' || node.nodeType === 'למדידה מאוחרת';
    const isIssue = node.nodeType === 'Issue';
    if (isHome || isForLater || isIssue) {
      heatmapColor = null;
    } else {
      const hasIssue = _issueNodeIds.has(String(node.id));
      const missingCoords = node.surveyX == null || node.surveyY == null;
      if (hasIssue || missingCoords) {
        heatmapColor = '#ef4444';
      } else if (!node.material || !node.coverDiameter || !node.access) {
        heatmapColor = '#f59e0b';
      } else {
        heatmapColor = '#22c55e';
      }
    }
  }

  const coordinateOptions = {
    showCoordinateStatus: coordinatesEnabled,
    coordinatesMap: coordinatesMap,
    isSelected: isSelected,
    viewScale: sizeVS,
    heatmapColor: heatmapColor
  };
  drawNodeIcon(ctx, stretchedN, radius, COLORS, isSelected ? stretchedN : null, coordinateOptions);

  if (node.nodeType === 'Home' && node.directConnection) {
    drawDirectConnectionBadge(stretchedX, stretchedY, radius);
  }

  if (_issueNodeIds.has(String(node.id)) && sizeVS >= 0.15 && sizeVS < 3) {
    const badgeRadius = radius * 0.38;
    const badgeOffsetX = radius * 0.75;
    const badgeOffsetY = -radius * 0.75;
    const bx = stretchedX + badgeOffsetX;
    const by = stretchedY + badgeOffsetY;

    ctx.save();
    ctx.beginPath();
    ctx.arc(bx, by, badgeRadius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(239, 68, 68, 0.92)';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.2 / sizeVS;
    ctx.stroke();

    const bangSize = badgeRadius * 1.2;
    ctx.font = `bold ${bangSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText('!', bx, by + badgeRadius * 0.08);
    ctx.restore();
  }

  if (node.positionLocked && node.manual_x != null && node.manual_y != null && sizeVS >= 0.15 && sizeVS < 3) {
    const lockSize = radius * 0.4;
    const lx = stretchedX + radius * 0.7;
    const ly = stretchedY + radius * 0.7;

    ctx.save();
    ctx.beginPath();
    ctx.arc(lx, ly, lockSize, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(37, 99, 235, 0.9)';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.2 / sizeVS;
    ctx.stroke();

    const s = lockSize * 0.5;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.2 / sizeVS;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(lx, ly - s * 0.25, s * 0.4, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillRect(lx - s * 0.55, ly - s * 0.15, s * 1.1, s * 0.85);
    ctx.restore();
  }

  const fontSize = Math.round(16 * sizeScale / sizeVS);
  let labelText = String(node.id);

  if (node.nodeType === 'Home') {
    const idStr = String(node.id);
    if (!/^\d+$/.test(idStr)) {
      return null;
    }
    labelText = idStr;
  }

  return {
    text: labelText,
    nodeX: stretchedX,
    nodeY: stretchedY,
    nodeRadius: radius,
    fontSize: fontSize
  };
}

// ── Primitives wrappers ──────────────────────────────────────

function drawHouse(cx, cy, radius) {
  primitivesDrawHouse(S.ctx, cx, cy, radius);
}

function drawDirectConnectionBadge(cx, cy, radius) {
  primitivesDrawDirectConnectionBadge(S.ctx, cx, cy, radius, S.sizeVS);
}

// ── Canvas empty state ───────────────────────────────────────

function updateCanvasEmptyState() {
  const el = document.getElementById('canvasEmptyState');
  if (!el) return;
  const isEmpty = S.nodes.length === 0;
  const homePanel = S.homePanel;
  const startPanel = S.startPanel;
  const homePanelVisible = homePanel && homePanel.style.display !== 'none';
  const startPanelVisible = startPanel && startPanel.style.display !== 'none';
  const loginPanelEl = document.getElementById('loginPanel');
  const loginVisible = loginPanelEl && loginPanelEl.style.display !== 'none';
  const inProjectCanvas = typeof window.__projectCanvas?.isProjectCanvasMode === 'function' && window.__projectCanvas.isProjectCanvasMode();
  const shouldShow = isEmpty && !homePanelVisible && !startPanelVisible && !loginVisible && !inProjectCanvas;
  if (shouldShow) {
    el.classList.remove('canvas-empty-state--hidden');
  } else {
    el.classList.add('canvas-empty-state--hidden');
  }
}

// ── Schedule draw ────────────────────────────────────────────

function scheduleDraw() {
  if (S.drawScheduled) return;
  S.drawScheduled = true;
  window.requestAnimationFrame(() => {
    S.drawScheduled = false;
    draw();
  });
}

// ── Exports ──────────────────────────────────────────────────

export {
  draw,
  scheduleDraw,
  scheduleEdgeLegendUpdate,
  scheduleIncompleteEdgeUpdate,
  renderEdgeLegend,
  drawInfiniteGrid,
  ensureVirtualPadding,
  autoPanWhenDragging,
  computeNodeTypes,
  drawEdge,
  drawDanglingEdgeLocal,
  drawEdgeLabels,
  drawNode,
  drawHouse,
  drawDirectConnectionBadge,
  updateCanvasEmptyState,
};
