/**
 * 3D View — Camera framing.
 * Computes initial camera position and lookAt based on selection context.
 * No Three.js dependency — returns plain { position: {x,y,z}, lookAt: {x,y,z} }.
 */

/**
 * Compute initial camera placement.
 *
 * @param {{ selection: object|null, positions3D: Map, edges: Array, center: {x:number,y:number,z:number}, boundingBox: {min:{x:number,z:number}, max:{x:number,z:number}} }} opts
 * @returns {{ position: {x:number,y:number,z:number}, lookAt: {x:number,y:number,z:number} }}
 */
export function computeInitialCamera({ selection, positions3D, edges, center, boundingBox }) {
  if (selection?.type === 'node') {
    return frameNode(selection.node, positions3D, edges);
  }
  if (selection?.type === 'edge') {
    return frameEdge(selection.edge, positions3D);
  }
  return frameOverview(center, boundingBox);
}

// ── Node selected — side-view cross-section ──────────────────────────────────

export function frameNode(node, positions3D, edges) {
  const id = String(node.id);
  const pos = positions3D.get(id);
  if (!pos) return frameOverview({ x: 0, y: 0, z: 0 }, null);

  // Find connected edges and compute average pipe direction in XZ
  const connectedEdges = edges.filter(
    (e) => String(e.tail) === id || String(e.head) === id
  );

  let dirX = 0;
  let dirZ = 0;

  for (const edge of connectedEdges) {
    const otherId = String(edge.tail) === id ? String(edge.head) : String(edge.tail);
    const otherPos = positions3D.get(otherId);
    if (!otherPos) continue;
    const dx = otherPos.x - pos.x;
    const dz = otherPos.z - pos.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len > 0.001) {
      dirX += dx / len;
      dirZ += dz / len;
    }
  }

  // Normalize average direction
  const dirLen = Math.sqrt(dirX * dirX + dirZ * dirZ);
  if (dirLen > 0.001) {
    dirX /= dirLen;
    dirZ /= dirLen;
  } else {
    // No connected edges — arbitrary direction
    dirX = 1;
    dirZ = 0;
  }

  // Perpendicular in XZ plane (rotate 90°)
  const perpX = -dirZ;
  const perpZ = dirX;

  // Camera offset: look from the side at shaft mid-depth
  const depth = pos.depth || 2;
  const offset = Math.max(4, depth * 2);
  const lookY = pos.y - depth / 2;

  return {
    position: {
      x: pos.x + perpX * offset,
      y: lookY + 1,
      z: pos.z + perpZ * offset,
    },
    lookAt: {
      x: pos.x,
      y: lookY,
      z: pos.z,
    },
  };
}

// ── Edge selected — side-view of pipe segment ────────────────────────────────

export function frameEdge(edge, positions3D) {
  const tailPos = positions3D.get(String(edge.tail));
  const headPos = positions3D.get(String(edge.head));
  if (!tailPos || !headPos) return frameOverview({ x: 0, y: 0, z: 0 }, null);

  const tailDepth = parseNum(edge.tail_measurement, 1.5);
  const headDepth = parseNum(edge.head_measurement, 1.5);

  // Pipe midpoint in 3D
  const midX = (tailPos.x + headPos.x) / 2;
  const midY = ((tailPos.y - tailDepth) + (headPos.y - headDepth)) / 2;
  const midZ = (tailPos.z + headPos.z) / 2;

  // Pipe direction in XZ
  const dx = headPos.x - tailPos.x;
  const dz = headPos.z - tailPos.z;
  const pipeLen = Math.sqrt(dx * dx + dz * dz);

  let perpX, perpZ;
  if (pipeLen > 0.001) {
    // Perpendicular to pipe direction
    perpX = -dz / pipeLen;
    perpZ = dx / pipeLen;
  } else {
    perpX = 1;
    perpZ = 0;
  }

  const offset = Math.max(pipeLen * 0.8, 5);

  return {
    position: {
      x: midX + perpX * offset,
      y: midY + 1,
      z: midZ + perpZ * offset,
    },
    lookAt: {
      x: midX,
      y: midY,
      z: midZ,
    },
  };
}

// ── No selection — overview (fit-to-bounds using FOV) ────────────────────────

export function frameOverview(center, boundingBox) {
  let sizeX = 20, sizeZ = 20;
  if (boundingBox) {
    sizeX = Math.max(boundingBox.max.x - boundingBox.min.x, 5);
    sizeZ = Math.max(boundingBox.max.z - boundingBox.min.z, 5);
  }

  // Use the camera FOV to compute the proper distance to fit the bounding box.
  // PerspectiveCamera uses 60deg FOV (matching three-d-scene.js).
  const fovRad = (60 * Math.PI) / 180;
  const aspect = typeof window !== 'undefined' ? window.innerWidth / window.innerHeight : 16 / 9;

  // For perspective camera: dist = (size/2) / tan(fov/2)
  // Compute for both axes accounting for aspect ratio
  const halfFovV = fovRad / 2;
  const halfFovH = Math.atan(Math.tan(halfFovV) * aspect);

  const distForWidth = (sizeX / 2) / Math.tan(halfFovH);
  const distForDepth = (sizeZ / 2) / Math.tan(halfFovV);
  const requiredDist = Math.max(distForWidth, distForDepth);

  // Add 20% padding, enforce minimum distance
  const dist = Math.max(requiredDist * 1.2, 10);

  // Place camera at 45deg elevation for a nice isometric overview
  const elevAngle = Math.PI / 4;
  const azimAngle = Math.PI / 4;
  const horizontalDist = dist * Math.cos(elevAngle);
  const height = dist * Math.sin(elevAngle);

  return {
    position: {
      x: center.x + horizontalDist * Math.cos(azimAngle),
      y: height,
      z: center.z + horizontalDist * Math.sin(azimAngle),
    },
    lookAt: {
      x: center.x,
      y: -1, // slightly below ground to see underground content
      z: center.z,
    },
  };
}

// ── Utility ──────────────────────────────────────────────────────────────────

function parseNum(val, fallback) {
  if (val == null || val === '') return fallback;
  const n = parseFloat(val);
  return isNaN(n) || n <= 0 ? fallback : n;
}
