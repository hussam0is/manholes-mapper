/**
 * Sketch Completion Engine
 * Computes how "complete" the current sketch is across multiple dimensions.
 *
 * Scoring:
 *   40% — Nodes with survey coordinates (non-schematic, non-Home)
 *   30% — Edges with both depth measurements
 *   20% — Zero detected issues
 *   10% — All optional fields filled (material, diameter, access)
 */

// ── Completion cache with dirty-flag invalidation ───────────────────────
let _cachedCompletion = null;
let _completionDirty = true;

// Listen for sketch changes to invalidate cache
try {
  // Defer listener setup to allow menuEvents to initialize first
  const _setupDirtyListener = () => {
    if (window.menuEvents) {
      window.menuEvents.on('sketch:changed', () => { _completionDirty = true; });
    } else {
      // Retry once after a tick if menuEvents isn't ready yet
      setTimeout(() => {
        window.menuEvents?.on('sketch:changed', () => { _completionDirty = true; });
      }, 0);
    }
  };
  _setupDirtyListener();
} catch { /* ignore */ }

/**
 * Mark completion cache as dirty (for external callers that know data changed).
 */
export function invalidateCompletionCache() {
  _completionDirty = true;
}

/**
 * Compute completion metrics for the current sketch.
 * Results are cached and only recomputed when sketch data changes
 * (signaled by the 'sketch:changed' event setting the dirty flag).
 *
 * @returns {{ percentage: number, coordsPct: number, measurePct: number, issuesPct: number, fieldsPct: number, nodeCount: number, edgeCount: number, totalKm: number, issueCount: number }}
 */
export function computeSketchCompletion() {
  // Return cached result if data hasn't changed
  if (!_completionDirty && _cachedCompletion) {
    return _cachedCompletion;
  }

  const result = {
    percentage: 0,
    coordsPct: 0,
    measurePct: 0,
    issuesPct: 100,
    fieldsPct: 0,
    nodeCount: 0,
    edgeCount: 0,
    totalKm: 0,
    issueCount: 0
  };

  // Access sketch data from window globals (set by legacy/main.js)
  // Use __getSketchStats for direct references (no array copy) when available
  let nodes = [];
  let edges = [];

  try {
    const stats = window.__getSketchStats?.();
    if (stats) {
      nodes = stats.nodes || [];
      edges = stats.edges || [];
    } else {
      // Fallback for tests and environments without __getSketchStats
      const data = window.__getActiveSketchData?.();
      if (data) {
        nodes = data.nodes || [];
        edges = data.edges || [];
      }
    }
  } catch {
    return result;
  }

  if (!nodes.length) return result;

  result.nodeCount = nodes.length;
  result.edgeCount = edges.length;

  // ── 1. Coordinates (40%) ────────────────────────────────────
  // Count nodes that need coordinates (non-schematic, non-Home, non-ForLater)
  const needsCoords = nodes.filter(n =>
    n.accuracyLevel !== 1 &&
    n.nodeType !== 'Home' &&
    n.nodeType !== 'ForLater'
  );

  if (needsCoords.length > 0) {
    const hasCoords = needsCoords.filter(n =>
      n.surveyX != null && n.surveyY != null
    );
    result.coordsPct = (hasCoords.length / needsCoords.length) * 100;
  } else {
    result.coordsPct = 100; // No nodes need coords
  }

  // ── 2. Edge Measurements (30%) ──────────────────────────────
  const connectedEdges = edges.filter(e => e.tail != null && e.head != null);

  if (connectedEdges.length > 0) {
    const measured = connectedEdges.filter(e =>
      e.tail_measurement != null && e.tail_measurement !== '' &&
      e.head_measurement != null && e.head_measurement !== ''
    );
    result.measurePct = (measured.length / connectedEdges.length) * 100;
  } else {
    result.measurePct = 100;
  }

  // ── 3. Issues (20%) ────────────────────────────────────────
  // Inline issue detection (avoids async import)
  let issues = 0;

  // Missing coords on non-schematic nodes
  const missingCoords = nodes.filter(n =>
    n.accuracyLevel !== 1 &&
    n.nodeType !== 'Home' &&
    n.nodeType !== 'ForLater' &&
    (n.surveyX == null || n.surveyY == null)
  );
  issues += missingCoords.length;

  // Negative gradient edges
  const negGradient = connectedEdges.filter(e => {
    const tail = parseFloat(e.tail_measurement);
    const head = parseFloat(e.head_measurement);
    return !isNaN(tail) && !isNaN(head) && head > tail;
  });
  issues += negGradient.length;

  // Missing measurements on edges connected to functional manholes
  const functionalNodeIds = new Set(
    nodes.filter(n => n.maintenanceStatus === 1).map(n => String(n.id))
  );
  const missingMeasure = connectedEdges.filter(e => {
    const tailFunctional = functionalNodeIds.has(String(e.tail));
    const headFunctional = functionalNodeIds.has(String(e.head));
    if (!tailFunctional && !headFunctional) return false;
    return (e.tail_measurement == null || e.tail_measurement === '') ||
           (e.head_measurement == null || e.head_measurement === '');
  });
  issues += missingMeasure.length;

  result.issueCount = issues;
  result.issuesPct = issues === 0 ? 100 : Math.max(0, 100 - (issues * 15));

  // ── 4. Optional Fields (10%) ────────────────────────────────
  const manholes = nodes.filter(n =>
    n.nodeType === 'Manhole' || n.nodeType === 'Drainage' || !n.nodeType
  );

  if (manholes.length > 0) {
    let totalFields = 0;
    let filledFields = 0;

    manholes.forEach(n => {
      // Check material, coverDiameter, access
      totalFields += 3;
      if (n.material != null && n.material !== '' && n.material !== 0) filledFields++;
      if (n.coverDiameter != null && n.coverDiameter !== '') filledFields++;
      if (n.access != null && n.access !== '' && n.access !== 0) filledFields++;
    });

    result.fieldsPct = totalFields > 0 ? (filledFields / totalFields) * 100 : 100;
  } else {
    result.fieldsPct = 100;
  }

  // ── Total weighted score ────────────────────────────────────
  result.percentage = Math.round(
    result.coordsPct * 0.4 +
    result.measurePct * 0.3 +
    result.issuesPct * 0.2 +
    result.fieldsPct * 0.1
  );

  // Clamp to 0-100
  result.percentage = Math.max(0, Math.min(100, result.percentage));

  // Cache result and clear dirty flag
  _cachedCompletion = result;
  _completionDirty = false;

  return result;
}
