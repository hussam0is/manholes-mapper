/**
 * Fix suggestion engine.
 * Given an issue, returns applicable fix suggestions with action functions.
 */

/**
 * Get applicable fix suggestions for a given issue.
 * @param {object} issue - Issue from computeSketchIssues
 * @param {Array} nodes - mutable nodes array
 * @param {Array} edges - mutable edges array
 * @returns {Array<{ id: string, labelKey: string, icon: string, apply?: () => void, navigateTo?: object }>}
 */
export function getFixSuggestions(issue, nodes, edges) {
  const suggestions = [];

  if (issue.type === 'missing_pipe_data' || issue.type === 'missing_measurement') {
    const node = nodes.find(n => String(n.id) === String(issue.nodeId));
    if (!node) return suggestions;

    // 1. Convert to Home connection
    if (node.nodeType !== 'Home') {
      suggestions.push({
        id: 'convert_to_home',
        labelKey: 'fixes.convertToHome',
        icon: 'home',
        apply() {
          node.nodeType = 'Home';
        },
      });
    }

    // 2. Set maintenance status to "בית נעול" (code 13)
    if (node.maintenanceStatus !== 13) {
      suggestions.push({
        id: 'set_locked_house',
        labelKey: 'fixes.setLockedHouse',
        icon: 'lock',
        apply() {
          node.maintenanceStatus = 13;
        },
      });
    }

    // 3. Add measurement (navigational — caller handles opening the input)
    suggestions.push({
      id: 'add_measurement',
      labelKey: 'fixes.addMeasurement',
      icon: 'straighten',
      navigateTo: {
        type: 'edge',
        edgeId: issue.edgeId,
        focusField: issue.side === 'tail' ? 'tailInput' : 'headInput',
      },
    });
  }

  if (issue.type === 'merge_candidate') {
    const nodeA = nodes.find(n => String(n.id) === String(issue.nodeId));
    const nodeB = nodes.find(n => String(n.id) === String(issue.mergeNodeId));
    if (nodeA && nodeB) {
      suggestions.push({
        id: 'merge_stub_nodes',
        labelKey: 'fixes.mergeNodes',
        icon: 'call_merge',
        apply() {
          const t = typeof window.t === 'function' ? window.t : (k) => k;
          const msg = t('confirms.mergeNodes', issue.nodeId, issue.mergeNodeId, issue.distanceM);
          if (!confirm(msg)) return false;

          // Find the single edge connected to each stub node
          const idA = String(nodeA.id);
          const idB = String(nodeB.id);
          const edgeA = edges.find(e => String(e.tail) === idA || String(e.head) === idA);
          const edgeB = edges.find(e => String(e.tail) === idB || String(e.head) === idB);
          if (!edgeA || !edgeB) return false;

          // neighborY is the node on the other end of edgeB (not nodeB)
          const neighborYId = String(edgeB.tail) === idB ? edgeB.head : edgeB.tail;

          // Re-point edgeA: replace nodeA endpoint with neighborY
          if (String(edgeA.tail) === idA) {
            edgeA.tail = neighborYId;
          } else {
            edgeA.head = neighborYId;
          }

          // Copy edge data from edgeB to edgeA if edgeA lacks it
          if (!edgeA.material && edgeB.material) edgeA.material = edgeB.material;
          if (!edgeA.diameter && edgeB.diameter) edgeA.diameter = edgeB.diameter;
          if (!edgeA.edgeType && edgeB.edgeType) edgeA.edgeType = edgeB.edgeType;

          // Remove edgeB
          const edgeBIdx = edges.indexOf(edgeB);
          if (edgeBIdx !== -1) edges.splice(edgeBIdx, 1);

          // Remove nodeA and nodeB
          const nodeAIdx = nodes.indexOf(nodeA);
          if (nodeAIdx !== -1) nodes.splice(nodeAIdx, 1);
          const nodeBIdx = nodes.indexOf(nodeB);
          if (nodeBIdx !== -1) nodes.splice(nodeBIdx, 1);

          // Mark edgeA as non-dangling since both ends now connect to real nodes
          edgeA.isDangling = false;

          return true;
        },
      });
    }
  }

  if (issue.type === 'negative_gradient') {
    const edge = edges.find(e => e.id === issue.edgeId);
    if (!edge) return suggestions;

    // Swap tail/head measurements
    suggestions.push({
      id: 'swap_measurements',
      labelKey: 'fixes.swapMeasurements',
      icon: 'swap_vert',
      apply() {
        const tmp = edge.tail_measurement;
        edge.tail_measurement = edge.head_measurement;
        edge.head_measurement = tmp;
      },
    });
  }

  if (issue.type === 'obstructed_access') {
    const node = nodes.find(n => String(n.id) === String(issue.nodeId));
    if (!node) return suggestions;

    // 1. Schedule a revisit (navigational — marks node for revisit)
    suggestions.push({
      id: 'schedule_revisit',
      labelKey: 'fixes.scheduleRevisit',
      icon: 'event_repeat',
      apply() {
        node.note = (node.note ? node.note + '; ' : '') + 'לחזור למדוד';
      },
    });

    // 2. Convert to Home (if locked house / no access)
    if (node.maintenanceStatus === 13 && node.nodeType !== 'Home') {
      suggestions.push({
        id: 'convert_to_home',
        labelKey: 'fixes.convertToHome',
        icon: 'home',
        apply() {
          node.nodeType = 'Home';
        },
      });
    }
  }

  if (issue.type === 'schematic_location') {
    // Suggest measuring actual coordinates
    suggestions.push({
      id: 'measure_coordinates',
      labelKey: 'fixes.measureCoordinates',
      icon: 'my_location',
      navigateTo: {
        type: 'node',
        nodeId: issue.nodeId,
        focusField: 'coordinates',
      },
    });
  }

  if (issue.type === 'missing_tl') {
    // Suggest measuring TL elevation
    suggestions.push({
      id: 'measure_tl',
      labelKey: 'fixes.measureTL',
      icon: 'height',
      navigateTo: {
        type: 'node',
        nodeId: issue.nodeId,
        focusField: 'tl',
      },
    });

    // If material is missing too, suggest filling it
    const node = nodes.find(n => String(n.id) === String(issue.nodeId));
    if (node && (node.material == null || node.material === 0 || node.material === '')) {
      suggestions.push({
        id: 'fill_material',
        labelKey: 'fixes.fillMaterial',
        icon: 'category',
        navigateTo: {
          type: 'node',
          nodeId: issue.nodeId,
          focusField: 'material',
        },
      });
    }
  }

  if (issue.type === 'missing_coords') {
    // Suggest marking as schematic if coords can't be obtained
    const node = nodes.find(n => String(n.id) === String(issue.nodeId));
    if (node && node.accuracyLevel !== 1) {
      suggestions.push({
        id: 'mark_schematic',
        labelKey: 'fixes.markSchematic',
        icon: 'blur_on',
        apply() {
          node.accuracyLevel = 1;
        },
      });
    }
  }

  return suggestions;
}
