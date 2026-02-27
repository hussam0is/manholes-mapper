/**
 * 3D View — Miniature/collapsed view toggle.
 * Swaps between real-life scale 3D objects and small schematic icons.
 */

let _isMiniature = false;

/** Cache of original state per mesh, keyed by nodeId or 'edge_'+edgeId */
const _originals = new Map();

/** Shared mini geometries (created once per THREE instance) */
let _sphereGeo = null;
let _smallBoxGeo = null;

function ensureMiniGeometries(THREE) {
  if (!_sphereGeo) _sphereGeo = new THREE.SphereGeometry(0.25, 12, 8);
  if (!_smallBoxGeo) _smallBoxGeo = new THREE.BoxGeometry(0.5, 0.4, 0.5);
}

/**
 * Toggle between real and miniature views.
 * @param {typeof import('three')} THREE
 * @param {{ nodeMeshes: Map, pipeMeshes: Map }} meshRefs
 * @param {boolean} mini - true for miniature, false for real
 */
export function setMiniatureMode(THREE, meshRefs, mini) {
  if (mini === _isMiniature) return;
  _isMiniature = mini;
  ensureMiniGeometries(THREE);

  // -- Nodes --
  for (const [nodeId, refs] of meshRefs.nodeMeshes) {
    if (mini) {
      // Save original state
      if (!_originals.has(nodeId)) {
        if (refs.type === 'manhole') {
          _originals.set(nodeId, {
            type: 'manhole',
            coverGeo: refs.cover?.geometry,
            coverPos: refs.cover?.position.y,
            shaftVis: refs.shaft?.visible ?? true,
            innerVis: refs.inner?.visible ?? true,
            rimVis: refs.rim?.visible ?? true,
            bottomVis: refs.bottom?.visible ?? true,
          });
        } else if (refs.type === 'house') {
          _originals.set(nodeId, {
            type: 'house',
            bodyGeo: refs.body?.geometry,
            bodyPos: refs.body?.position.y,
            roofVis: refs.roof?.visible ?? true,
          });
        }
      }

      if (refs.type === 'manhole') {
        // Swap cover to small sphere, hide everything else
        if (refs.cover) {
          refs.cover.geometry = _sphereGeo;
          refs.cover.position.y = (_originals.get(nodeId)?.coverPos ?? 0) + 0.25;
        }
        if (refs.shaft) refs.shaft.visible = false;
        if (refs.inner) refs.inner.visible = false;
        if (refs.rim) refs.rim.visible = false;
        if (refs.bottom) refs.bottom.visible = false;
      } else if (refs.type === 'house') {
        // Swap body to small cube, hide roof
        if (refs.body) {
          refs.body.geometry = _smallBoxGeo;
          refs.body.position.y = 0.2;
        }
        if (refs.roof) refs.roof.visible = false;
      }
    } else {
      // Restore originals
      const orig = _originals.get(nodeId);
      if (!orig) continue;

      if (orig.type === 'manhole') {
        if (refs.cover && orig.coverGeo) {
          refs.cover.geometry = orig.coverGeo;
          refs.cover.position.y = orig.coverPos;
        }
        if (refs.shaft) refs.shaft.visible = orig.shaftVis;
        if (refs.inner) refs.inner.visible = orig.innerVis;
        if (refs.rim) refs.rim.visible = orig.rimVis;
        if (refs.bottom) refs.bottom.visible = orig.bottomVis;
      } else if (orig.type === 'house') {
        if (refs.body && orig.bodyGeo) {
          refs.body.geometry = orig.bodyGeo;
          refs.body.position.y = orig.bodyPos;
        }
        if (refs.roof) refs.roof.visible = orig.roofVis;
      }
    }
  }

  // -- Pipes --
  for (const [_edgeId, refs] of meshRefs.pipeMeshes) {
    if (mini) {
      // Scale pipe thin
      if (refs.tube) refs.tube.scale.set(0.15, 0.15, 1);
      if (refs.startCap) refs.startCap.visible = false;
      if (refs.endCap) refs.endCap.visible = false;
    } else {
      // Restore
      if (refs.tube) refs.tube.scale.set(1, 1, 1);
      if (refs.startCap) refs.startCap.visible = true;
      if (refs.endCap) refs.endCap.visible = true;
    }
  }
}

/** @returns {boolean} */
export function isMiniatureMode() {
  return _isMiniature;
}

/** Reset state (call on 3D view close). */
export function resetMiniatureState() {
  _isMiniature = false;
  _originals.clear();
}
