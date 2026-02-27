/**
 * 3D View — Issue interaction layer.
 * Raycasts on click/long-press to detect node/edge objects,
 * shows a fix suggestion popup for elements with issues.
 */

import { getFixSuggestions } from '../project/fix-suggestions.js';

/**
 * Set up raycasting and issue interaction on the 3D overlay.
 *
 * @param {typeof import('three')} THREE
 * @param {object} opts
 * @param {THREE.Camera} opts.camera
 * @param {THREE.Scene} opts.scene
 * @param {THREE.WebGLRenderer} opts.renderer
 * @param {HTMLElement} opts.container
 * @param {Array} opts.nodes - mutable nodes array
 * @param {Array} opts.edges - mutable edges array
 * @param {Array} opts.issues - computed issues array
 * @param {() => void} [opts.onFixApplied] - callback after a fix is applied
 * @returns {{ dispose: () => void }}
 */
export function setup3DIssueInteraction(THREE, opts) {
  const { camera, scene, renderer, container, nodes, edges, issues, onFixApplied } = opts;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let popup = null;
  let longPressTimer = null;

  function getIntersectedObject(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    // Handle FPS pointer lock — raycast at center of screen
    if (document.pointerLockElement === renderer.domElement) {
      pointer.set(0, 0);
    } else {
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    }
    raycaster.setFromCamera(pointer, camera);

    const intersects = raycaster.intersectObjects(scene.children, true);
    for (const hit of intersects) {
      const ud = hit.object.userData;
      if (ud?.type === 'node' || ud?.type === 'edge') {
        return hit.object;
      }
    }
    return null;
  }

  function showPopup(clientX, clientY, object) {
    removePopup();
    const ud = object.userData;
    const t = window.t || ((k) => k);
    const esc = (s) => window.escapeHtml?.(s) || s;

    // Find matching issues
    let matchingIssues;
    if (ud.type === 'node') {
      matchingIssues = issues.filter(i => String(i.nodeId) === ud.nodeId);
    } else {
      matchingIssues = issues.filter(i => String(i.edgeId) === String(ud.edgeId));
    }
    if (matchingIssues.length === 0) return;

    popup = document.createElement('div');
    popup.className = 'three-d-fix-popup';

    // Header
    let html = `<div class="three-d-fix-popup__header">
      <span class="material-icons">warning</span>
      <span>${matchingIssues.length} ${esc(t('projects.canvas.issues'))}</span>
      <button class="three-d-fix-popup__close"><span class="material-icons">close</span></button>
    </div>`;

    // Issue rows with fix buttons
    for (const issue of matchingIssues) {
      // Issue type label
      let typeLabel = issue.type;
      if (issue.type === 'missing_coords') typeLabel = t('projects.canvas.missingCoords');
      else if (issue.type === 'missing_measurement') typeLabel = t('projects.canvas.missingMeasurement');
      else if (issue.type === 'long_edge') typeLabel = t('projects.canvas.longPipe');
      else if (issue.type === 'not_last_manhole') typeLabel = t('projects.canvas.notLastManhole');
      else if (issue.type === 'negative_gradient') typeLabel = t('projects.canvas.negativeGradient');

      html += `<div class="three-d-fix-popup__issue-label">${esc(typeLabel)}</div>`;

      const suggestions = getFixSuggestions(issue, nodes, edges);
      for (const fix of suggestions) {
        if (fix.navigateTo) continue;
        html += `<button class="three-d-fix-popup__btn" data-fix-id="${fix.id}" data-issue-idx="${issues.indexOf(issue)}">
          <span class="material-icons">${fix.icon}</span> ${esc(t(fix.labelKey))}
        </button>`;
      }
    }

    popup.innerHTML = html;

    // Position near click
    const rect = container.getBoundingClientRect();
    const popupX = Math.min(clientX - rect.left + 10, rect.width - 200);
    const popupY = Math.max(clientY - rect.top - 10, 10);
    popup.style.left = popupX + 'px';
    popup.style.top = popupY + 'px';
    container.appendChild(popup);

    // Close button
    popup.querySelector('.three-d-fix-popup__close')?.addEventListener('click', removePopup);

    // Fix buttons
    popup.querySelectorAll('.three-d-fix-popup__btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const fixId = btn.dataset.fixId;
        const issueIdx = parseInt(btn.dataset.issueIdx, 10);
        const issue = issues[issueIdx];
        if (!issue) return;
        const suggestions = getFixSuggestions(issue, nodes, edges);
        const fix = suggestions.find(s => s.id === fixId);
        if (fix?.apply) {
          fix.apply();
          onFixApplied?.();
          removePopup();
          window.showToast?.(window.t?.('fixes.applied') || 'Fix applied');
        }
      });
    });
  }

  function removePopup() {
    if (popup) { popup.remove(); popup = null; }
  }

  // Desktop: click
  function onClick(e) {
    // Ignore if clicking on the popup itself
    if (e.target.closest('.three-d-fix-popup')) return;
    const obj = getIntersectedObject(e.clientX, e.clientY);
    if (obj) {
      showPopup(e.clientX, e.clientY, obj);
    } else {
      removePopup();
    }
  }

  // Mobile: long-press (400ms)
  function onTouchStart(e) {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    longPressTimer = setTimeout(() => {
      const obj = getIntersectedObject(touch.clientX, touch.clientY);
      if (obj) showPopup(touch.clientX, touch.clientY, obj);
    }, 400);
  }
  function onTouchEnd() { clearTimeout(longPressTimer); }
  function onTouchMove() { clearTimeout(longPressTimer); }

  renderer.domElement.addEventListener('click', onClick);
  renderer.domElement.addEventListener('touchstart', onTouchStart, { passive: true });
  renderer.domElement.addEventListener('touchend', onTouchEnd);
  renderer.domElement.addEventListener('touchmove', onTouchMove, { passive: true });

  return {
    dispose() {
      removePopup();
      clearTimeout(longPressTimer);
      renderer.domElement.removeEventListener('click', onClick);
      renderer.domElement.removeEventListener('touchstart', onTouchStart);
      renderer.domElement.removeEventListener('touchend', onTouchEnd);
      renderer.domElement.removeEventListener('touchmove', onTouchMove);
    },
  };
}
