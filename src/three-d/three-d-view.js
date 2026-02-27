/**
 * 3D View — Main orchestrator.
 * Lazy-loads Three.js, creates a fullscreen overlay, renders the sketch
 * as a 3D underground visualization, and handles cleanup on close.
 */

import { buildScene } from './three-d-scene.js';
import { EDGE_TYPE_COLORS } from './three-d-materials.js';

let isOpen = false;

/**
 * Open the 3D view for the current active sketch.
 * Lazy-loads Three.js on first call.
 */
export async function open3DView() {
  if (isOpen) return;
  isOpen = true;

  const t = window.t || ((k) => k);

  // ── Extract sketch data ─────────────────────────────────────────────────
  const sketchData = window.__getActiveSketchData?.();
  if (!sketchData || !sketchData.nodes?.length) {
    window.showToast?.(t('threeD.noNodes'));
    isOpen = false;
    return;
  }

  const ref = window.__getMapReferencePoint?.() ?? null;
  const coordScale = window.__getCoordinateScale?.() ?? 50;

  // ── Create overlay DOM ──────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.className = 'three-d-overlay';
  overlay.innerHTML = `
    <div class="three-d-overlay__header">
      <div class="three-d-overlay__title">
        <span class="material-icons" aria-hidden="true">view_in_ar</span>
        <span>${window.escapeHtml?.(t('threeD.title')) || '3D View'}</span>
      </div>
      <button class="three-d-overlay__close" aria-label="${window.escapeHtml?.(t('threeD.close')) || 'Close'}">
        <span class="material-icons">close</span>
      </button>
    </div>
    <div class="three-d-overlay__canvas-container">
      <div class="three-d-overlay__loading">
        <span class="material-icons" style="animation: spin 1s linear infinite">hourglass_top</span>
        <span>${window.escapeHtml?.(t('threeD.loading')) || 'Loading 3D view...'}</span>
      </div>
    </div>
    <div class="three-d-overlay__legend">
      <h4>${window.escapeHtml?.(t('threeD.legend.title')) || 'Legend'}</h4>
      <div class="three-d-overlay__legend-item">
        <span class="three-d-overlay__legend-swatch" style="background:#2563eb"></span>
        <span>${window.escapeHtml?.(t('threeD.legend.mainLine')) || 'Main Line'}</span>
      </div>
      <div class="three-d-overlay__legend-item">
        <span class="three-d-overlay__legend-swatch" style="background:#fb923c"></span>
        <span>${window.escapeHtml?.(t('threeD.legend.drainageLine')) || 'Drainage Line'}</span>
      </div>
      <div class="three-d-overlay__legend-item">
        <span class="three-d-overlay__legend-swatch" style="background:#0d9488"></span>
        <span>${window.escapeHtml?.(t('threeD.legend.secondaryLine')) || 'Secondary Line'}</span>
      </div>
      <div class="three-d-overlay__legend-item">
        <span class="three-d-overlay__legend-swatch three-d-overlay__legend-swatch--estimated" style="background:#888"></span>
        <span>${window.escapeHtml?.(t('threeD.legend.estimated')) || 'Estimated'}</span>
      </div>
    </div>
    <div class="three-d-overlay__controls-hint">
      ${window.escapeHtml?.(t('threeD.controls.rotate')) || 'Rotate: drag mouse'}<br>
      ${window.escapeHtml?.(t('threeD.controls.zoom')) || 'Zoom: scroll wheel'}<br>
      ${window.escapeHtml?.(t('threeD.controls.pan')) || 'Pan: right-click drag'}
    </div>
  `;

  document.body.appendChild(overlay);

  const container = overlay.querySelector('.three-d-overlay__canvas-container');
  const loadingEl = overlay.querySelector('.three-d-overlay__loading');
  const closeBtn = overlay.querySelector('.three-d-overlay__close');
  const controlsHint = overlay.querySelector('.three-d-overlay__controls-hint');

  // ── Cleanup state ───────────────────────────────────────────────────────
  let renderer = null;
  let labelRenderer = null;
  let animFrameId = null;
  let controls = null;
  let sceneResult = null;
  let resizeObserver = null;

  function cleanup() {
    isOpen = false;

    if (animFrameId != null) cancelAnimationFrame(animFrameId);
    if (controls) controls.dispose();
    if (resizeObserver) resizeObserver.disconnect();

    // Dispose scene
    if (sceneResult) {
      sceneResult.scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      sceneResult.materials.dispose();
    }

    if (renderer) {
      renderer.dispose();
      renderer.forceContextLoss();
    }
    if (labelRenderer) {
      labelRenderer.domElement.remove();
    }

    overlay.remove();
    document.removeEventListener('keydown', onKeyDown);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cleanup();
    }
  }

  closeBtn.addEventListener('click', cleanup);
  document.addEventListener('keydown', onKeyDown);

  // ── Lazy-load Three.js ──────────────────────────────────────────────────
  let THREE, OrbitControls, CSS2DRenderer, CSS2DObject;
  try {
    [THREE, { OrbitControls }, { CSS2DRenderer, CSS2DObject }] = await Promise.all([
      import('three'),
      import('three/addons/controls/OrbitControls.js'),
      import('three/addons/renderers/CSS2DRenderer.js'),
    ]);
  } catch (err) {
    console.error('[3D View] Failed to load Three.js:', err);
    window.showToast?.(t('threeD.loadError'));
    cleanup();
    return;
  }

  // Remove loading indicator
  if (loadingEl) loadingEl.remove();

  // ── Build scene ─────────────────────────────────────────────────────────
  const data = {
    nodes: sketchData.nodes,
    edges: sketchData.edges || [],
    ref,
    coordScale,
  };

  sceneResult = buildScene(THREE, data, CSS2DObject);
  const { scene, camera, center } = sceneResult;

  // ── Renderer ────────────────────────────────────────────────────────────
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  // Label renderer (CSS2D)
  labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.style.left = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  container.appendChild(labelRenderer.domElement);

  // ── Controls ────────────────────────────────────────────────────────────
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(center);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1;
  controls.maxDistance = 500;
  controls.maxPolarAngle = Math.PI * 0.85; // don't go completely underneath
  controls.update();

  // ── Resize handling ─────────────────────────────────────────────────────
  function onResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;

    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
  }

  resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(container);
  onResize(); // initial size

  // ── Fade controls hint ──────────────────────────────────────────────────
  if (controlsHint) {
    setTimeout(() => {
      controlsHint.style.opacity = '0';
    }, 5000);
    setTimeout(() => {
      controlsHint.remove();
    }, 5500);
  }

  // ── Render loop ─────────────────────────────────────────────────────────
  function animate() {
    animFrameId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }

  animate();
}
