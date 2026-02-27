/**
 * 3D View — Material factories for manhole/pipe visualization.
 * Creates PBR materials color-coded by node type and edge type.
 */

const NODE_TYPE_COLORS = {
  Manhole: 0x555555,
  Drainage: 0x607d8b,
  Home: 0x795548,
  Covered: 0x9e9e9e,
  ForLater: 0xa855f7,
};

const EDGE_TYPE_COLORS = {
  'קו ראשי': 0x2563eb,
  'קו סניקה': 0xfb923c,
  'קו משני': 0x0d9488,
};

/**
 * @param {typeof import('three')} THREE
 */
export function createMaterials(THREE) {
  const ground = new THREE.MeshStandardMaterial({
    color: 0x8b7355,
    transparent: true,
    opacity: 0.25,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const manholeWall = new THREE.MeshStandardMaterial({
    color: 0x888888,
    side: THREE.DoubleSide,
    roughness: 0.9,
    metalness: 0.05,
  });

  const manholeWallInner = new THREE.MeshStandardMaterial({
    color: 0x555555,
    side: THREE.BackSide,
    roughness: 1.0,
    metalness: 0,
  });

  const houseWall = new THREE.MeshStandardMaterial({
    color: 0x795548,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    roughness: 0.8,
    metalness: 0.05,
  });

  const houseRoof = new THREE.MeshStandardMaterial({
    color: 0x8b4513,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
    roughness: 0.7,
    metalness: 0.05,
  });

  /** Cache cover materials by node type */
  const coverCache = new Map();
  function manholeCover(nodeType) {
    if (coverCache.has(nodeType)) return coverCache.get(nodeType);
    const mat = new THREE.MeshStandardMaterial({
      color: NODE_TYPE_COLORS[nodeType] || 0x555555,
      roughness: 0.7,
      metalness: 0.3,
    });
    coverCache.set(nodeType, mat);
    return mat;
  }

  /** Cache pipe materials by edge type */
  const pipeCache = new Map();
  function pipe(edgeType) {
    if (pipeCache.has(edgeType)) return pipeCache.get(edgeType);
    const mat = new THREE.MeshStandardMaterial({
      color: EDGE_TYPE_COLORS[edgeType] || 0x2563eb,
      roughness: 0.6,
      metalness: 0.1,
    });
    pipeCache.set(edgeType, mat);
    return mat;
  }

  /** Create a semi-transparent clone for estimated/default data */
  function estimated(baseMaterial) {
    const mat = baseMaterial.clone();
    mat.transparent = true;
    mat.opacity = 0.5;
    return mat;
  }

  /** Dispose all cached materials */
  function dispose() {
    ground.dispose();
    manholeWall.dispose();
    manholeWallInner.dispose();
    houseWall.dispose();
    houseRoof.dispose();
    for (const m of coverCache.values()) m.dispose();
    for (const m of pipeCache.values()) m.dispose();
    coverCache.clear();
    pipeCache.clear();
  }

  return { ground, manholeWall, manholeWallInner, houseWall, houseRoof, manholeCover, pipe, estimated, dispose };
}

export { NODE_TYPE_COLORS, EDGE_TYPE_COLORS };
