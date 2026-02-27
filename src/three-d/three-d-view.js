/**
 * 3D View — Main orchestrator.
 * Lazy-loads Three.js, creates a fullscreen overlay, renders the sketch
 * as a 3D underground visualization, and handles cleanup on close.
 *
 * Supports two camera modes:
 *   - Orbit: rotate/zoom/pan (default when no selection)
 *   - Free cam: PUBG spectator-style fly-through with WASD/joystick (default when selection exists)
 */

import { buildScene } from './three-d-scene.js';
import { EDGE_TYPE_COLORS } from './three-d-materials.js';
import { computeInitialCamera } from './three-d-camera-framing.js';
import { FPSControls } from './three-d-fps-controls.js';
import { VirtualJoystick } from './three-d-joystick.js';
import { computeSketchIssues } from '../project/sketch-issues.js';

let isOpen = false;

/**
 * Open the 3D view for the current active sketch.
 * Lazy-loads Three.js on first call.
 *
 * @param {{ selection?: object|null }} [opts]
 */
export async function open3DView(opts = {}) {
  if (isOpen) return;
  isOpen = true;

  const selection = opts.selection ?? null;
  const t = window.t || ((k) => k);
  const esc = (s) => window.escapeHtml?.(s) || s;

  // ── Extract sketch data ─────────────────────────────────────────────────
  const sketchData = window.__getActiveSketchData?.();
  if (!sketchData || !sketchData.nodes?.length) {
    window.showToast?.(t('threeD.noNodes'));
    isOpen = false;
    return;
  }

  const ref = window.__getMapReferencePoint?.() ?? null;
  const coordScale = window.__getCoordinateScale?.() ?? 50;

  // Start in FPS mode when a selection exists
  let currentMode = selection ? 'fps' : 'orbit';

  // ── Create overlay DOM ──────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.className = 'three-d-overlay';
  overlay.innerHTML = `
    <div class="three-d-overlay__header">
      <div class="three-d-overlay__title">
        <span class="material-icons" aria-hidden="true">view_in_ar</span>
        <span>${esc(t('threeD.title'))}</span>
      </div>
      <div class="three-d-overlay__header-actions">
        <div class="three-d-overlay__speed-control" style="display:${currentMode === 'fps' ? 'flex' : 'none'}">
          <button class="three-d-overlay__speed-btn" data-dir="-1">
            <span class="material-icons">remove</span>
          </button>
          <span class="three-d-overlay__speed-badge">1×</span>
          <button class="three-d-overlay__speed-btn" data-dir="1">
            <span class="material-icons">add</span>
          </button>
        </div>
        <button class="three-d-overlay__mode-toggle" aria-label="${esc(t('threeD.modeToggle'))}">
          <span class="material-icons">${currentMode === 'fps' ? '3d_rotation' : 'directions_walk'}</span>
          <span class="three-d-overlay__mode-label">${esc(currentMode === 'fps' ? t('threeD.modeOrbit') : t('threeD.modeFPS'))}</span>
        </button>
        <button class="three-d-overlay__close" aria-label="${esc(t('threeD.close'))}">
          <span class="material-icons">close</span>
        </button>
      </div>
    </div>
    <div class="three-d-overlay__canvas-container">
      <div class="three-d-overlay__loading">
        <span class="material-icons" style="animation: spin 1s linear infinite">hourglass_top</span>
        <span>${esc(t('threeD.loading'))}</span>
      </div>
      <div class="three-d-overlay__crosshair" style="display:${currentMode === 'fps' ? 'flex' : 'none'}">+</div>
    </div>
    <div class="three-d-overlay__legend">
      <h4>${esc(t('threeD.legend.title'))}</h4>
      <div class="three-d-overlay__legend-item">
        <span class="three-d-overlay__legend-swatch" style="background:#2563eb"></span>
        <span>${esc(t('threeD.legend.mainLine'))}</span>
      </div>
      <div class="three-d-overlay__legend-item">
        <span class="three-d-overlay__legend-swatch" style="background:#fb923c"></span>
        <span>${esc(t('threeD.legend.drainageLine'))}</span>
      </div>
      <div class="three-d-overlay__legend-item">
        <span class="three-d-overlay__legend-swatch" style="background:#0d9488"></span>
        <span>${esc(t('threeD.legend.secondaryLine'))}</span>
      </div>
      <div class="three-d-overlay__legend-item">
        <span class="three-d-overlay__legend-swatch three-d-overlay__legend-swatch--estimated" style="background:#888"></span>
        <span>${esc(t('threeD.legend.estimated'))}</span>
      </div>
    </div>
    <div class="three-d-overlay__controls-hint"></div>
  `;

  document.body.appendChild(overlay);

  const container = overlay.querySelector('.three-d-overlay__canvas-container');
  const loadingEl = overlay.querySelector('.three-d-overlay__loading');
  const closeBtn = overlay.querySelector('.three-d-overlay__close');
  const modeToggleBtn = overlay.querySelector('.three-d-overlay__mode-toggle');
  const controlsHint = overlay.querySelector('.three-d-overlay__controls-hint');
  const crosshair = overlay.querySelector('.three-d-overlay__crosshair');

  // ── Landscape orientation lock ────────────────────────────────────────
  let orientationLocked = false;
  try {
    await screen.orientation?.lock?.('landscape');
    orientationLocked = true;
  } catch { /* not supported or not allowed — ignore */ }

  // ── Cleanup state ───────────────────────────────────────────────────────
  let renderer = null;
  let labelRenderer = null;
  let animFrameId = null;
  let orbitControls = null;
  let fpsControls = null;
  let joystick = null;
  let sceneResult = null;
  let resizeObserver = null;

  function cleanup() {
    isOpen = false;

    if (animFrameId != null) cancelAnimationFrame(animFrameId);
    if (orbitControls) orbitControls.dispose();
    if (fpsControls) fpsControls.dispose();
    if (joystick) joystick.dispose();
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

    // Unlock orientation
    if (orientationLocked) {
      try { screen.orientation?.unlock?.(); } catch { /* ignore */ }
    }

    // Exit pointer lock
    if (document.pointerLockElement) {
      try { document.exitPointerLock(); } catch { /* ignore */ }
    }

    overlay.remove();
    document.removeEventListener('keydown', onKeyDown);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      // In FPS pointer-lock mode, Escape just exits pointer lock (browser default)
      // Only close overlay if not in pointer lock
      if (document.pointerLockElement) return;
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

  const { issues } = computeSketchIssues(data.nodes, data.edges);
  sceneResult = buildScene(THREE, data, CSS2DObject, issues);
  const { scene, camera, center, boundingBox, positions3D } = sceneResult;

  // ── Camera framing based on selection ─────────────────────────────────
  const framing = computeInitialCamera({
    selection,
    positions3D,
    edges: data.edges,
    center: { x: center.x, y: center.y, z: center.z },
    boundingBox,
  });
  camera.position.set(framing.position.x, framing.position.y, framing.position.z);
  camera.lookAt(framing.lookAt.x, framing.lookAt.y, framing.lookAt.z);

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

  // ── Orbit controls ────────────────────────────────────────────────────
  orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.target.set(framing.lookAt.x, framing.lookAt.y, framing.lookAt.z);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.08;
  orbitControls.minDistance = 1;
  orbitControls.maxDistance = 500;
  orbitControls.maxPolarAngle = Math.PI * 0.85;
  orbitControls.update();

  // ── FPS controls + Joystick ───────────────────────────────────────────
  joystick = new VirtualJoystick(container);

  fpsControls = new FPSControls(camera, renderer.domElement, {
    onJoystickStart(x, y) { joystick.show(x, y); },
    onJoystickMove(dx, dy, max) { joystick.move(dx, dy, max); },
    onJoystickEnd() { joystick.hide(); },
  });

  // ── Mode switching ────────────────────────────────────────────────────
  function setMode(mode) {
    currentMode = mode;
    const modeIcon = modeToggleBtn.querySelector('.material-icons');
    const modeLabel = modeToggleBtn.querySelector('.three-d-overlay__mode-label');

    if (mode === 'fps') {
      orbitControls.enabled = false;
      fpsControls.initFromCamera();
      fpsControls.enable();
      crosshair.style.display = 'flex';
      // Button shows "switch to orbit"
      modeIcon.textContent = '3d_rotation';
      modeLabel.textContent = esc(t('threeD.modeOrbit'));
      updateControlsHint('fps');
    } else {
      fpsControls.disable();
      joystick.hide();
      // Sync orbit target to where camera is looking
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      orbitControls.target.copy(camera.position).add(dir.multiplyScalar(5));
      orbitControls.enabled = true;
      orbitControls.update();
      crosshair.style.display = 'none';
      // Button shows "switch to FPS"
      modeIcon.textContent = 'directions_walk';
      modeLabel.textContent = esc(t('threeD.modeFPS'));
      updateControlsHint('orbit');
    }
  }

  modeToggleBtn.addEventListener('click', () => {
    setMode(currentMode === 'fps' ? 'orbit' : 'fps');
  });

  // ── Controls hint (always visible, fades to reduced opacity) ────────
  function updateControlsHint(mode) {
    if (!controlsHint) return;
    controlsHint.style.opacity = '1';
    controlsHint.style.display = 'block';

    if (mode === 'fps') {
      controlsHint.innerHTML =
        `${esc(t('threeD.controls.fpsMove'))}<br>` +
        `${esc(t('threeD.controls.fpsLook'))}<br>` +
        `${esc(t('threeD.controls.fpsSprint'))}<br>` +
        `${esc(t('threeD.controls.fpsUpDown'))}`;
    } else {
      controlsHint.innerHTML =
        `${esc(t('threeD.controls.rotate'))}<br>` +
        `${esc(t('threeD.controls.zoom'))}<br>` +
        `${esc(t('threeD.controls.pan'))}`;
    }

    // Fade to reduced opacity after 4s — stays visible
    clearTimeout(controlsHint._fadeTimer);
    controlsHint._fadeTimer = setTimeout(() => {
      controlsHint.style.opacity = '0.5';
    }, 4000);
  }

  // Apply initial mode
  setMode(currentMode);

  // ── Resize handling ───────────────────────────────────────────────────
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

  // ── Render loop (delta-time) ──────────────────────────────────────────
  let lastTime = performance.now();

  function animate(now) {
    animFrameId = requestAnimationFrame(animate);
    const dt = Math.min((now - lastTime) / 1000, 0.1); // cap at 100ms
    lastTime = now;

    if (currentMode === 'fps') {
      fpsControls.update(dt);
    } else {
      orbitControls.update();
    }

    // Pulse issue rings
    if (sceneResult?.issueGroup) {
      const time = now / 1000;
      sceneResult.issueGroup.traverse((child) => {
        if (child.userData?.type === 'issue-ring' && child.material) {
          child.material.opacity = 0.4 + 0.4 * Math.sin(time * 3);
        }
      });
    }

    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }

  animFrameId = requestAnimationFrame(animate);
}
