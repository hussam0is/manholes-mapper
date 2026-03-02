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

  return suggestions;
}
