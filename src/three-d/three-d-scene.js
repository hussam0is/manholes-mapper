/**
 * 3D View — Scene builder.
 * Constructs a Three.js scene from sketch data: manholes as cylindrical shafts,
 * pipes as tubes, a translucent ground plane, lights, and camera.
 */

import { createMaterials, EDGE_TYPE_COLORS } from './three-d-materials.js';

// ── Default values for missing data ─────────────────────────────────────────
export const DEFAULT_DEPTH = 2.0;            // manhole shaft depth (m) when no edges have measurements
export const DEFAULT_PIPE_DEPTH = 1.5;       // pipe invert depth (m) when measurement is missing
export const DEFAULT_PIPE_DIAMETER_MM = 200; // pipe diameter (mm) when not specified
export const DEFAULT_COVER_DIAMETER_CM = 55; // manhole cover diameter (cm) when not specified
export const SHAFT_WALL_THICKNESS = 0.08;    // manhole wall thickness (m)
export const COVER_HEIGHT = 0.06;            // manhole cover disc thickness (m)
export const MANHOLE_SEGMENTS = 24;          // cylinder resolution
export const PIPE_RADIAL_SEGMENTS = 12;      // tube cross-section resolution
export const PIPE_TUBULAR_SEGMENTS = 16;     // tube length resolution

// ── Helpers ─────────────────────────────────────────────────────────────────

export function parseNum(val, fallback) {
  if (val == null || val === '') return fallback;
  const n = parseFloat(val);
  return isNaN(n) || n <= 0 ? fallback : n;
}

/**
 * Get 3D horizontal position for a node.
 * Prefers surveyX/Y (ITM meters), falls back to manual_x/y, then canvas→ITM.
 */
export function getNodeXZ(node, ref, coordScale) {
  let itmX, itmY;
  if (node.surveyX != null && node.surveyY != null) {
    itmX = node.surveyX;
    itmY = node.surveyY;
  } else if (node.manual_x != null && node.manual_y != null) {
    itmX = node.manual_x;
    itmY = node.manual_y;
  } else if (ref) {
    itmX = ref.itm.x + (node.x - ref.canvas.x) / coordScale;
    itmY = ref.itm.y - (node.y - ref.canvas.y) / coordScale;
  } else {
    // No reference point — use canvas coords as meters (rough approximation)
    itmX = node.x / coordScale;
    itmY = node.y / coordScale;
  }
  return { itmX, itmY };
}

/**
 * Compute the max pipe depth at a node from all connected edges.
 * Returns { depth, isEstimated }.
 */
export function getNodeDepth(nodeId, edges) {
  let maxDepth = 0;
  let hasAnyMeasurement = false;

  for (const edge of edges) {
    if (String(edge.tail) === nodeId) {
      const d = parseNum(edge.tail_measurement, 0);
      if (d > 0) { maxDepth = Math.max(maxDepth, d); hasAnyMeasurement = true; }
    }
    if (String(edge.head) === nodeId) {
      const d = parseNum(edge.head_measurement, 0);
      if (d > 0) { maxDepth = Math.max(maxDepth, d); hasAnyMeasurement = true; }
    }
  }

  if (!hasAnyMeasurement) {
    return { depth: DEFAULT_DEPTH, isEstimated: true };
  }
  // Add 0.3m clearance below the deepest pipe
  return { depth: maxDepth + 0.3, isEstimated: false };
}

// ── House model builder ──────────────────────────────────────────────────────

/**
 * Build a transparent 3D house model for Home-type nodes.
 * Dimensions: 3m front x 4m deep x 2.5m wall height + pitched roof.
 */
function buildHouseModel(THREE, group, pos, nodeId, isEstimated, materials, CSS2DObject) {
  const WIDTH = 3;        // front face width (m)
  const DEPTH = 4;        // side depth (m)
  const WALL_H = 2.5;     // wall height (m)
  const ROOF_H = 1.2;     // roof peak above walls (m)

  const wallMat = isEstimated ? materials.estimated(materials.houseWall) : materials.houseWall;
  const roofMat = isEstimated ? materials.estimated(materials.houseRoof) : materials.houseRoof;

  // Box body (walls)
  const bodyGeo = new THREE.BoxGeometry(WIDTH, WALL_H, DEPTH);
  const body = new THREE.Mesh(bodyGeo, wallMat);
  body.position.set(pos.x, pos.y + WALL_H / 2, pos.z);
  body.userData = { type: 'node', nodeId };
  group.add(body);

  // Pitched roof using extruded triangle (ridge along Z / depth direction)
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-WIDTH / 2 - 0.15, 0);
  roofShape.lineTo(0, ROOF_H);
  roofShape.lineTo(WIDTH / 2 + 0.15, 0);
  roofShape.closePath();

  const roofGeo = new THREE.ExtrudeGeometry(roofShape, {
    depth: DEPTH + 0.3,
    bevelEnabled: false,
  });

  const roof = new THREE.Mesh(roofGeo, roofMat);
  // Position roof at wall top, centered along depth
  roof.position.set(pos.x, pos.y + WALL_H, pos.z - (DEPTH + 0.3) / 2);
  roof.userData = { type: 'node', nodeId };
  group.add(roof);

  // CSS2D Label above the roof
  let label = null;
  if (CSS2DObject) {
    const labelDiv = document.createElement('div');
    labelDiv.className = 'three-d-label';
    labelDiv.textContent = nodeId;
    label = new CSS2DObject(labelDiv);
    label.position.set(pos.x, pos.y + WALL_H + ROOF_H + 0.3, pos.z);
    group.add(label);
  }

  return { body, roof, label };
}

// ── Main builder ────────────────────────────────────────────────────────────

/**
 * Build the 3D scene from sketch data.
 *
 * @param {typeof import('three')} THREE
 * @param {{ nodes: Array, edges: Array, ref: object|null, coordScale: number }} data
 * @param {Function} CSS2DObject - CSS2DObject constructor from three/addons
 * @returns {{ scene: THREE.Scene, camera: THREE.PerspectiveCamera, materials: object, boundingBox: { min: THREE.Vector3, max: THREE.Vector3 }, center: THREE.Vector3 }}
 */
export function buildScene(THREE, data, CSS2DObject, issues = []) {
  const { nodes, edges, ref, coordScale } = data;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);
  // Fog density is set after bounding box is computed (see below)

  const materials = createMaterials(THREE);

  // ── Build node map and compute 3D positions ───────────────────────────────
  const nodeMap = new Map();
  const positions3D = new Map(); // nodeId → { x, y (ground elevation), z, depth, isEstimated }

  // First pass: collect ITM coords + elevations
  const itmCoords = [];
  const elevations = [];
  for (const node of nodes) {
    nodeMap.set(String(node.id), node);
    const { itmX, itmY } = getNodeXZ(node, ref, coordScale);
    itmCoords.push({ id: String(node.id), itmX, itmY });
    if (node.surveyZ != null && !isNaN(parseFloat(node.surveyZ))) {
      elevations.push(parseFloat(node.surveyZ));
    }
  }

  // Compute centroid for centering
  const centroidX = itmCoords.reduce((s, c) => s + c.itmX, 0) / itmCoords.length;
  const centroidY = itmCoords.reduce((s, c) => s + c.itmY, 0) / itmCoords.length;
  const avgElevation = elevations.length > 0
    ? elevations.reduce((s, e) => s + e, 0) / elevations.length
    : 0;

  // Second pass: build 3D positions
  for (const { id, itmX, itmY } of itmCoords) {
    const node = nodeMap.get(id);
    const groundZ = node.surveyZ != null ? parseFloat(node.surveyZ) : avgElevation;
    const isElevationEstimated = node.surveyZ == null;
    const { depth, isEstimated: isDepthEstimated } = getNodeDepth(id, edges);

    positions3D.set(id, {
      x: itmX - centroidX,
      y: groundZ - avgElevation,   // relative to avg ground
      z: -(itmY - centroidY),      // flip Y → Z (north = -Z)
      groundZ,
      depth,
      isEstimated: isElevationEstimated || isDepthEstimated,
    });
  }

  // ── Lights ────────────────────────────────────────────────────────────────
  const ambient = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight.position.set(50, 80, 30);
  scene.add(dirLight);

  const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x8b7355, 0.4);
  scene.add(hemiLight);

  // ── Ground plane ──────────────────────────────────────────────────────────
  const bbox = computeBounds(positions3D);

  // Adaptive fog — scale density inversely with network size so overview stays visible
  const diagonal = Math.sqrt(bbox.sizeX ** 2 + bbox.sizeZ ** 2) || 20;
  const fogDensity = Math.min(0.003, 1.5 / Math.max(diagonal, 20));
  scene.fog = new THREE.FogExp2(0x1a1a2e, fogDensity);
  const groundSize = Math.max(bbox.sizeX, bbox.sizeZ, 20) * 2;
  const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize);
  groundGeo.rotateX(-Math.PI / 2); // lay flat
  const groundMesh = new THREE.Mesh(groundGeo, materials.ground);
  groundMesh.position.set(0, 0, 0);
  groundMesh.renderOrder = -1;
  scene.add(groundMesh);

  // Grid helper on the ground
  const gridHelper = new THREE.GridHelper(groundSize, Math.min(Math.floor(groundSize / 2), 40), 0x555555, 0x3a3a3a);
  gridHelper.position.y = -0.01;
  gridHelper.material.opacity = 0.4;
  gridHelper.material.transparent = true;
  scene.add(gridHelper);

  // ── Mesh references for miniature toggle ─────────────────────────────────
  const meshRefs = {
    nodeMeshes: new Map(),  // nodeId → { type: 'manhole'|'house', meshes... }
    pipeMeshes: new Map(),  // edgeId → { tube, startCap, endCap }
  };

  // ── Manholes ──────────────────────────────────────────────────────────────
  const manholeGroup = new THREE.Group();
  manholeGroup.name = 'manholes';

  for (const node of nodes) {
    const id = String(node.id);
    const pos = positions3D.get(id);
    if (!pos) continue;

    if (node.nodeType === 'Home') {
      // ── House model ──
      const houseRefs = buildHouseModel(THREE, manholeGroup, pos, id, pos.isEstimated, materials, CSS2DObject);
      meshRefs.nodeMeshes.set(id, {
        type: 'house',
        body: houseRefs.body,
        roof: houseRefs.roof,
        label: houseRefs.label,
        nodeType: node.nodeType,
      });
    } else {
      // ── Manhole cylinder ──
      const coverDiameterM = parseNum(node.coverDiameter, DEFAULT_COVER_DIAMETER_CM) / 100;
      const outerRadius = coverDiameterM / 2;
      const innerRadius = outerRadius - SHAFT_WALL_THICKNESS;
      const depth = pos.depth;
      const isEstimated = pos.isEstimated;

      // Shaft (outer cylinder wall)
      const shaftGeo = new THREE.CylinderGeometry(
        outerRadius, outerRadius, depth, MANHOLE_SEGMENTS, 1, true
      );
      const wallMat = isEstimated ? materials.estimated(materials.manholeWall) : materials.manholeWall;
      const shaft = new THREE.Mesh(shaftGeo, wallMat);
      shaft.position.set(pos.x, pos.y - depth / 2, pos.z);
      manholeGroup.add(shaft);

      // Inner wall (may not exist if innerRadius <= 0.02)
      let inner = null;
      if (innerRadius > 0.02) {
        const innerGeo = new THREE.CylinderGeometry(
          innerRadius, innerRadius, depth, MANHOLE_SEGMENTS, 1, true
        );
        const innerMat = isEstimated ? materials.estimated(materials.manholeWallInner) : materials.manholeWallInner;
        inner = new THREE.Mesh(innerGeo, innerMat);
        inner.position.set(pos.x, pos.y - depth / 2, pos.z);
        manholeGroup.add(inner);
      }

      // Bottom disc (floor of manhole)
      const bottomGeo = new THREE.CircleGeometry(innerRadius > 0.02 ? innerRadius : outerRadius, MANHOLE_SEGMENTS);
      bottomGeo.rotateX(-Math.PI / 2);
      const bottom = new THREE.Mesh(bottomGeo, materials.manholeWall);
      bottom.position.set(pos.x, pos.y - depth, pos.z);
      manholeGroup.add(bottom);

      // Cover disc at ground level
      const coverGeo = new THREE.CylinderGeometry(
        outerRadius + 0.03, outerRadius + 0.03, COVER_HEIGHT, MANHOLE_SEGMENTS
      );
      const coverMat = materials.manholeCover(node.nodeType || 'Manhole');
      const cover = new THREE.Mesh(coverGeo, isEstimated ? materials.estimated(coverMat) : coverMat);
      cover.position.set(pos.x, pos.y + COVER_HEIGHT / 2, pos.z);
      cover.userData = { type: 'node', nodeId: id };
      manholeGroup.add(cover);

      // Cover ring (metallic rim)
      const rimGeo = new THREE.TorusGeometry(outerRadius + 0.03, 0.015, 8, MANHOLE_SEGMENTS);
      rimGeo.rotateX(Math.PI / 2);
      const rimMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6, roughness: 0.4 });
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.position.set(pos.x, pos.y + COVER_HEIGHT, pos.z);
      manholeGroup.add(rim);

      // Label (CSS2D)
      let label = null;
      if (CSS2DObject) {
        const labelDiv = document.createElement('div');
        labelDiv.className = 'three-d-label';
        labelDiv.textContent = node.id;
        label = new CSS2DObject(labelDiv);
        label.position.set(pos.x, pos.y + 0.35, pos.z);
        manholeGroup.add(label);
      }

      meshRefs.nodeMeshes.set(id, {
        type: 'manhole',
        cover, shaft, inner, rim, bottom, label,
      });
    }
  }

  scene.add(manholeGroup);

  // ── Pipes ─────────────────────────────────────────────────────────────────
  const pipeGroup = new THREE.Group();
  pipeGroup.name = 'pipes';

  for (const edge of edges) {
    if (edge.isDangling) continue;
    const tailId = String(edge.tail);
    const headId = String(edge.head);
    if (!tailId || !headId) continue;

    const tailPos = positions3D.get(tailId);
    const headPos = positions3D.get(headId);
    if (!tailPos || !headPos) continue;

    const tailDepth = parseNum(edge.tail_measurement, DEFAULT_PIPE_DEPTH);
    const headDepth = parseNum(edge.head_measurement, DEFAULT_PIPE_DEPTH);
    const diameterM = parseNum(edge.line_diameter, DEFAULT_PIPE_DIAMETER_MM) / 1000;
    const pipeRadius = Math.max(diameterM / 2, 0.025); // minimum visual radius

    const isEstimated =
      !edge.tail_measurement && !edge.head_measurement;

    // Pipe start and end positions (at invert level)
    const start = new THREE.Vector3(
      tailPos.x,
      tailPos.y - tailDepth,
      tailPos.z
    );
    const end = new THREE.Vector3(
      headPos.x,
      headPos.y - headDepth,
      headPos.z
    );

    // Use TubeGeometry along a line curve
    const curve = new THREE.LineCurve3(start, end);
    const tubeGeo = new THREE.TubeGeometry(
      curve, PIPE_TUBULAR_SEGMENTS, pipeRadius, PIPE_RADIAL_SEGMENTS, false
    );

    const pipeMat = materials.pipe(edge.edge_type || 'קו ראשי');
    const finalMat = isEstimated ? materials.estimated(pipeMat) : pipeMat;
    const pipeMesh = new THREE.Mesh(tubeGeo, finalMat);
    pipeMesh.userData = { type: 'edge', edgeId: edge.id, tailId: tailId, headId: headId };
    pipeGroup.add(pipeMesh);

    // Pipe end caps (flat circles)
    const capGeo = new THREE.CircleGeometry(pipeRadius, PIPE_RADIAL_SEGMENTS);
    const capMat = finalMat;

    const startCap = new THREE.Mesh(capGeo.clone(), capMat);
    startCap.position.copy(start);
    startCap.lookAt(end);
    pipeGroup.add(startCap);

    const endCap = new THREE.Mesh(capGeo.clone(), capMat);
    endCap.position.copy(end);
    endCap.lookAt(start);
    pipeGroup.add(endCap);

    // Direction arrow (cone) at pipe midpoint pointing tail→head
    const arrowRadius = Math.max(pipeRadius * 4, 0.15);
    const arrowLength = Math.max(arrowRadius * 3, 0.5);
    const arrowGeo = new THREE.ConeGeometry(arrowRadius, arrowLength, 8);
    const arrowMat = new THREE.MeshStandardMaterial({
      color: finalMat.color ? finalMat.color.clone() : new THREE.Color(0xffffff),
      emissive: finalMat.color ? finalMat.color.clone().multiplyScalar(0.4) : new THREE.Color(0x444444),
      metalness: 0.3,
      roughness: 0.4,
    });
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    // Position at midpoint of pipe
    arrow.position.set(
      (start.x + end.x) / 2,
      (start.y + end.y) / 2,
      (start.z + end.z) / 2
    );
    // ConeGeometry tip is at +Y. Rotate mesh so +Y aligns with tail→head direction.
    const dir = new THREE.Vector3().subVectors(end, start).normalize();
    arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    pipeGroup.add(arrow);

    meshRefs.pipeMeshes.set(String(edge.id), { tube: pipeMesh, startCap, endCap, arrow });
  }

  scene.add(pipeGroup);

  // ── Issue badges (3D) ──────────────────────────────────────────────────
  const issueGroup = new THREE.Group();
  issueGroup.name = 'issues';

  const issueNodeIds = new Set(issues.filter(i => i.nodeId != null).map(i => String(i.nodeId)));
  const issueEdgeIds = new Set(issues.filter(i => i.edgeId != null).map(i => String(i.edgeId)));

  // Red pulsing ring around issue manhole covers
  const issueRingMat = new THREE.MeshBasicMaterial({
    color: 0xff3333,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
  });

  for (const node of nodes) {
    const id = String(node.id);
    if (!issueNodeIds.has(id)) continue;
    const pos = positions3D.get(id);
    if (!pos) continue;

    const coverDiameterM = parseNum(node.coverDiameter, DEFAULT_COVER_DIAMETER_CM) / 100;
    const outerRadius = coverDiameterM / 2 + 0.03;

    // Glowing ring above cover
    const ringGeo = new THREE.TorusGeometry(outerRadius + 0.08, 0.035, 8, MANHOLE_SEGMENTS);
    ringGeo.rotateX(Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, issueRingMat.clone());
    ring.position.set(pos.x, pos.y + COVER_HEIGHT + 0.03, pos.z);
    ring.userData = { type: 'issue-ring', nodeId: id };
    issueGroup.add(ring);

    // CSS2D warning badge floating above
    if (CSS2DObject) {
      const badgeDiv = document.createElement('div');
      badgeDiv.className = 'three-d-issue-badge';
      badgeDiv.innerHTML = '<span class="material-icons">warning</span>';
      const badge = new CSS2DObject(badgeDiv);
      badge.position.set(pos.x, pos.y + 0.6, pos.z);
      issueGroup.add(badge);
    }
  }

  // Red-tint pipes that have issues
  pipeGroup.traverse((child) => {
    if (child.isMesh && child.userData.type === 'edge' && issueEdgeIds.has(String(child.userData.edgeId))) {
      child.material = child.material.clone();
      child.material.color.set(0xff3333);
      if (child.material.emissive) child.material.emissive.set(0x330000);
    }
  });

  scene.add(issueGroup);

  // ── Camera ────────────────────────────────────────────────────────────────
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);

  // Initial camera position (will be overridden by three-d-view.js framing).
  // Use FOV-based fit-to-bounds for a reasonable default.
  const sizeX = Math.max(bbox.sizeX, 5);
  const sizeZ = Math.max(bbox.sizeZ, 5);
  const fovRad = (60 * Math.PI) / 180;
  const aspect = typeof window !== 'undefined' ? window.innerWidth / window.innerHeight : 16 / 9;
  const halfFovV = fovRad / 2;
  const halfFovH = Math.atan(Math.tan(halfFovV) * aspect);
  const distForWidth = (sizeX / 2) / Math.tan(halfFovH);
  const distForDepth = (sizeZ / 2) / Math.tan(halfFovV);
  const camDist = Math.max(Math.max(distForWidth, distForDepth) * 1.2, 10);
  const elevAngle = Math.PI / 4;
  const horizontalDist = camDist * Math.cos(elevAngle);
  const camHeight = camDist * Math.sin(elevAngle);
  camera.position.set(
    bbox.centerX + horizontalDist * Math.cos(Math.PI / 4),
    camHeight,
    bbox.centerZ + horizontalDist * Math.sin(Math.PI / 4)
  );
  camera.lookAt(bbox.centerX, -1, bbox.centerZ);

  return {
    scene,
    camera,
    materials,
    center: new THREE.Vector3(bbox.centerX, 0, bbox.centerZ),
    boundingBox: {
      min: new THREE.Vector3(bbox.minX, -10, bbox.minZ),
      max: new THREE.Vector3(bbox.maxX, 5, bbox.maxZ),
    },
    positions3D,
    nodeMap,
    issueGroup,
    meshRefs,
  };
}

// ── Bounding box ────────────────────────────────────────────────────────────

export function computeBounds(positions3D) {
  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (const pos of positions3D.values()) {
    minX = Math.min(minX, pos.x);
    maxX = Math.max(maxX, pos.x);
    minZ = Math.min(minZ, pos.z);
    maxZ = Math.max(maxZ, pos.z);
  }

  if (!isFinite(minX)) { minX = -10; maxX = 10; minZ = -10; maxZ = 10; }

  return {
    minX, maxX, minZ, maxZ,
    sizeX: maxX - minX,
    sizeZ: maxZ - minZ,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
  };
}
