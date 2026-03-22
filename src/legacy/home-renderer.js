/**
 * home-renderer.js
 *
 * Home panel rendering functions extracted from src/legacy/main.js.
 * State via S proxy, cross-module calls via F registry.
 */

import { S, F } from './shared-state.js';
import {
  getLibrary,
  setLibrary,
  syncProjectSketchesToLibrary,
  loadProjectReferenceLayers,
  loadFromLibrary,
  updateSyncStatusUI,
} from './library-manager.js';
import { idbSaveRecordCompat } from '../state/persistence.js';
import { DEFAULT_INPUT_FLOW_CONFIG } from '../state/constants.js';
import {
  extractNodeItmCoordinates,
  surveyToCanvas,
  saveCoordinatesToStorage,
  saveCoordinatesEnabled,
} from '../utils/coordinates.js';
import {
  setMapReferencePoint,
  setStreetViewVisible,
  precacheTilesForMeasurementBounds,
  wgs84ToItm,
} from '../map/govmap-layer.js';
import {
  loadProjectSketches,
  isProjectCanvasMode,
} from '../project/project-canvas-state.js';
import { showSketchSidePanel } from '../project/sketch-side-panel.js';
import {
  showProjectLoadingOverlay,
  updateLoadingStep,
  hideProjectLoadingOverlay,
  forceCloseProjectLoadingOverlay,
} from '../project/project-loading-overlay.js';

const t = (...args) => F.t(...args);

const MIN_SCALE = 0.005;
const MAX_SCALE = 5.0;

// === Local state ===
// Track the current sketch tab (personal or organization)
let currentSketchTab = 'personal';
// Track which home mode is active: 'projects' or 'sketches'
// Restore last used tab from localStorage, default to 'sketches' (My Sketches)
let homeMode = (() => {
  try {
    const saved = localStorage.getItem('homeMode');
    return (saved === 'projects' || saved === 'sketches') ? saved : 'sketches';
  } catch { return 'sketches'; }
})();
// Search query for home panel filtering
let homeSearchQuery = '';

/** @returns {'projects'|'sketches'} */
export function getHomeMode() { return homeMode; }

// Format sketch display name - use name if available, otherwise format creation date
function formatSketchDisplayName(rec) {
  if (rec.name && rec.name.trim()) {
    return rec.name;
  }
  // Format creation date as display name
  try {
    const date = new Date(rec.createdAt || rec.creationDate);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString(S.currentLang === 'he' ? 'he-IL' : 'en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    }
  } catch (e) {}
  // Fallback to shortened ID
  return rec.id ? rec.id.replace('sk_', '#') : 'Sketch';
}

/**
 * Render a compact "Resume Last Work" bar at the top of the sketch list.
 * Replaces the old Mission Control header with a single-row bar showing
 * the most recent sketch name, inline stats, and a Continue button.
 */
export function renderResumeBar() {
  // Remove previous bar if exists
  const existing = document.getElementById('resumeBar');
  if (existing) existing.remove();

  // Find the most recently updated sketch
  const lib = getLibrary();
  if (lib.length === 0) return;

  const activeSketch = [...lib].sort((a, b) => {
    const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return bTime - aTime;
  })[0];
  if (!activeSketch) return;

  const bar = document.createElement('div');
  bar.id = 'resumeBar';
  bar.className = 'resume-bar';

  const name = escapeHtml(formatSketchDisplayName(activeSketch));
  const nodeCount = activeSketch.nodeCount ?? (activeSketch.nodes || []).length;
  const edgeCount = activeSketch.edgeCount ?? (activeSketch.edges || []).length;

  // Streak badge
  const streak = parseInt(localStorage.getItem('cockpit_streak') || '0', 10);
  const streakHtml = streak > 0 ? `<span class="resume-bar__streak"><span class="material-icons">local_fire_department</span>${streak}</span>` : '';

  bar.innerHTML = `
    <span class="resume-bar__icon material-icons">play_circle</span>
    <span class="resume-bar__name" title="${name}">${name}</span>
    ${streakHtml}
    <span class="resume-bar__stats">
      <span class="material-icons">account_tree</span>${nodeCount}
      <span class="material-icons">timeline</span>${edgeCount}
    </span>
    <button class="resume-bar__btn" data-sketch-id="${escapeHtml(String(activeSketch.id))}">
      <span class="material-icons">play_arrow</span>
      <span>${t('homeScreen.resumeWork')}</span>
    </button>`;

  // Insert before sketch list
  if (S.homePanel) {
    const body = S.homePanel.querySelector('.home-panel-body') || S.sketchListEl?.parentElement;
    if (body) {
      body.insertBefore(bar, body.firstChild);
    }
  }

  // Wire continue button
  const continueBtn = bar.querySelector('.resume-bar__btn');
  if (continueBtn) {
    continueBtn.addEventListener('click', () => {
      const sketchId = continueBtn.dataset.sketchId;
      if (sketchId) loadFromLibrary(sketchId);
    });
  }
}

/**
 * Render a search bar in the home panel for filtering projects/sketches.
 * Inserts between mode tabs and sketch tabs (or list content).
 */
export function renderSearchBar() {
  let searchBar = S.homePanel?.querySelector('.home-search-bar');
  if (!searchBar) {
    searchBar = document.createElement('div');
    searchBar.className = 'home-search-bar';
    searchBar.innerHTML = `
      <span class="home-search-bar__icon material-icons">search</span>
      <input type="search" class="home-search-bar__input" placeholder="${t('home.searchPlaceholder')}" autocomplete="off" />`;
    // Insert after sketch tabs or mode tabs
    const sketchTabs = document.getElementById('sketchTabs');
    const modeTabs = S.homePanel?.querySelector('.home-mode-tabs');
    const insertAfter = sketchTabs || modeTabs;
    if (insertAfter && insertAfter.parentNode) {
      insertAfter.parentNode.insertBefore(searchBar, insertAfter.nextSibling);
    } else if (S.homePanel) {
      const content = S.homePanel.querySelector('.home-panel-content');
      if (content) content.insertBefore(searchBar, content.firstChild);
    }
    // Wire input handler
    const input = searchBar.querySelector('.home-search-bar__input');
    if (input) {
      input.addEventListener('input', () => {
        homeSearchQuery = input.value.trim().toLowerCase();
        if (homeMode === 'projects') renderProjectsHome();
        else renderHome();
      });
    }
  }
  // Update placeholder based on mode
  const input = searchBar.querySelector('.home-search-bar__input');
  if (input) {
    input.placeholder = t('home.searchPlaceholder');
    // Preserve the query in the input
    if (homeSearchQuery && input.value !== homeSearchQuery) {
      input.value = homeSearchQuery;
    }
  }
  // Show/hide based on mode (always show)
  searchBar.style.display = '';
}

export function renderHome() {
  if (!S.homePanel || !S.sketchListEl) return;
  homeMode = 'sketches';
  try { localStorage.setItem('homeMode', 'sketches'); } catch { /* ignore */ }

  // Undo projects-mode overrides
  S.homePanel.classList.remove('home-panel--projects');
  // Reset title and icon
  if (S.homeTitleEl) S.homeTitleEl.textContent = t('homeTitle');
  const headerIcon = S.homePanel.querySelector('.home-panel-header-title .material-icons');
  if (headerIcon) headerIcon.textContent = 'folder_open';
  // Restore close button
  const closeBtn = document.getElementById('homePanelCloseBtn');
  if (closeBtn) closeBtn.style.display = '';
  // Restore footer with "New Sketch" button (renderProjectsHome may have hidden it)
  const footer = S.homePanel.querySelector('.home-panel-footer');
  if (footer) {
    footer.style.display = '';
    footer.innerHTML = `
      <button id="createFromHomeBtn" class="home-panel-new-btn">
        <span class="material-icons">add_circle</span>
        <span>${t('createFromHome')}</span>
      </button>`;
    const createBtn = footer.querySelector('#createFromHomeBtn');
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        hideHome(true);
        S.startPanel.style.display = 'flex';
      });
    }
  }

  // Render top-level mode tabs (Projects | My Sketches) for quick switching
  renderHomeModeTabs('sketches');

  S.startPanel.style.display = 'none';
  S.homePanel.classList.remove('panel-closing');
  S.homePanel.style.display = 'flex';

  // Compact resume bar (replaces old Mission Control header)
  renderResumeBar();

  // Search bar
  renderSearchBar();

  // Update sync status
  if (window.syncService?.getSyncState) {
    updateSyncStatusUI(window.syncService.getSyncState());
  }

  // Check if user is admin to show organization tab
  const userRole = window.permissionsService?.getUserRole?.();
  const isAdminUser = userRole?.isAdmin === true;

  // Setup tabs
  const sketchTabs = document.getElementById('sketchTabs');
  const personalTab = document.getElementById('personalTab');
  const organizationTab = document.getElementById('organizationTab');

  if (sketchTabs) {
    // Clear inline display:none set by renderProjectsHome()
    sketchTabs.style.display = '';
    // Show organization tab only for admin users
    if (isAdminUser) {
      sketchTabs.classList.add('show-org');
    } else {
      sketchTabs.classList.remove('show-org');
      currentSketchTab = 'personal'; // Reset to personal if not admin
    }

    // Update active tab state
    if (personalTab) {
      personalTab.classList.toggle('active', currentSketchTab === 'personal');
    }
    if (organizationTab) {
      organizationTab.classList.toggle('active', currentSketchTab === 'organization');
    }

    // Add tab click handlers (remove old ones first to avoid duplicates)
    if (personalTab && !personalTab._hasTabHandler) {
      personalTab.addEventListener('click', () => {
        currentSketchTab = 'personal';
        renderHome();
      });
      personalTab._hasTabHandler = true;
    }
    if (organizationTab && !organizationTab._hasTabHandler) {
      organizationTab.addEventListener('click', () => {
        currentSketchTab = 'organization';
        renderHome();
      });
      organizationTab._hasTabHandler = true;
    }
  }

  const lib = getLibrary();

  // Filter sketches based on selected tab
  let filteredLib = lib.filter(rec => {
    if (currentSketchTab === 'personal') {
      return rec.isOwner === true || rec.isOwner === undefined; // Include undefined for backwards compatibility
    } else {
      return rec.isOwner === false; // Organization sketches (not owned by current user)
    }
  });

  // Apply search filter
  if (homeSearchQuery) {
    filteredLib = filteredLib.filter(rec => {
      const name = (formatSketchDisplayName(rec) || '').toLowerCase();
      const createdBy = (rec.createdBy || '').toLowerCase();
      const modifiedBy = (rec.lastEditedBy || '').toLowerCase();
      return name.includes(homeSearchQuery) || createdBy.includes(homeSearchQuery) || modifiedBy.includes(homeSearchQuery);
    });
  }

  // Stable sort: newest updated first, then by ID as tiebreaker
  filteredLib.sort((a, b) => {
    const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
    if (bTime !== aTime) return bTime - aTime;
    return (a.id || '').localeCompare(b.id || '');
  });

  S.sketchListEl.innerHTML = '';

  // Show loading spinner while syncing and list is empty
  const syncState = window.syncService?.getSyncState?.();
  if (syncState?.isSyncing && filteredLib.length === 0) {
    const loading = document.createElement('div');
    loading.className = 'sketch-list-loading';
    loading.innerHTML = `
      <span class="material-icons spin">sync</span>
      <span>${t('auth.syncing')}</span>
    `;
    S.sketchListEl.appendChild(loading);
    return;
  }

  if (filteredLib.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'sketch-list-empty';
    const emptyIcon = homeSearchQuery ? 'search_off' : 'inbox';
    const emptyText = homeSearchQuery ? t('home.noSearchResults') : (currentSketchTab === 'organization' ? t('noOrganizationSketches') || 'No organization sketches' : t('noSketches'));
    empty.innerHTML = `
      <span class="material-icons">${emptyIcon}</span>
      <span>${emptyText}</span>
    `;
    S.sketchListEl.appendChild(empty);
  } else {
    filteredLib.forEach((rec) => {
      const item = document.createElement('div');
      const isCurrentSketch = rec.id === S.currentSketchId;
      item.className = `sketch-card${isCurrentSketch ? ' sketch-card-active' : ''}`;
      const title = formatSketchDisplayName(rec);
      const nodeCount = rec.nodeCount ?? (rec.nodes || []).length;
      const edgeCount = rec.edgeCount ?? (rec.edges || []).length;

      // Show owner info for admin users viewing other users' sketches
      const ownerDisplay = rec.ownerUsername || rec.createdBy || rec.ownerEmail || '';
      const showOwnerInfo = isAdminUser && !rec.isOwner && ownerDisplay;

      // Get created by and modified by labels
      const createdByUser = rec.createdBy || '';
      const modifiedByUser = rec.lastEditedBy || '';
      const showCreatedBy = createdByUser && createdByUser.length > 0;
      const showModifiedBy = modifiedByUser && modifiedByUser.length > 0;

      const safeRecId = escapeHtml(rec.id);
      const safeTitle = escapeHtml(title);
      const safeCreatedByUser = escapeHtml(createdByUser);
      const safeModifiedByUser = escapeHtml(modifiedByUser);
      const safeOwnerDisplay = escapeHtml(ownerDisplay);
      item.innerHTML = `
        ${isCurrentSketch ? `<div class="sketch-card-active-badge">
          <span class="material-icons">check_circle</span>
          <span>${t('listCurrentSketch')}</span>
        </div>` : ''}
        <div class="sketch-card-header">
          <div class="sketch-card-icon${isCurrentSketch ? ' active' : ''}">
            <span class="material-icons">description</span>
          </div>
          <div class="sketch-card-info">
            <div class="sketch-card-title sketch-title" data-id="${safeRecId}" role="button" tabindex="0" aria-label="${t('aria.sketchTitleEdit')}">${safeTitle}</div>
            <div class="sketch-card-meta">
              <span class="material-icons">schedule</span>
              ${t('listUpdated', new Date(rec.updatedAt || rec.createdAt).toLocaleString(S.currentLang === 'he' ? 'he-IL' : 'en-GB'))}
            </div>
            <div class="sketch-card-user-info">
              ${showCreatedBy ? `<div class="sketch-card-meta sketch-card-creator">
                <span class="material-icons" aria-hidden="true">person_add</span>
                <span>${t('createdBy') || 'Created by'}: ${safeCreatedByUser}</span>
              </div>` : ''}
              ${showModifiedBy ? `<div class="sketch-card-meta sketch-card-modifier">
                <span class="material-icons" aria-hidden="true">edit</span>
                <span>${t('modifiedBy') || 'Modified by'}: ${safeModifiedByUser}</span>
              </div>` : ''}
            </div>
            ${showOwnerInfo ? `<div class="sketch-card-meta sketch-card-owner">
              <span class="material-icons">person</span>
              <span>${safeOwnerDisplay}</span>
            </div>` : ''}
          </div>
        </div>
        <div class="sketch-card-stats">
          <div class="sketch-stat">
            <span class="material-icons">account_tree</span>
            <span>${nodeCount}</span>
          </div>
          <div class="sketch-stat">
            <span class="material-icons">timeline</span>
            <span>${edgeCount}</span>
          </div>
        </div>
        <div class="sketch-card-actions">
          ${isCurrentSketch ? '' : `<button class="sketch-action-btn sketch-action-primary" data-action="open" data-id="${safeRecId}">
            <span class="material-icons">open_in_new</span>
            <span>${t('listOpen')}</span>
          </button>`}
          <button class="sketch-action-btn" data-action="changeProject" data-id="${safeRecId}">
            <span class="material-icons">folder</span>
            <span>${t('listChangeProject')}</span>
          </button>
          <button class="sketch-action-btn" data-action="duplicate" data-id="${safeRecId}">
            <span class="material-icons">content_copy</span>
            <span>${t('listDuplicate')}</span>
          </button>
          ${!isCurrentSketch ? `
          <button class="sketch-action-btn" data-action="importHistory" data-id="${safeRecId}">
            <span class="material-icons">history</span>
            <span>${t('listImportHistory')}</span>
          </button>` : ''}
          <button class="sketch-action-btn sketch-action-danger" data-action="delete" data-id="${safeRecId}" aria-label="${t('listDelete')}" title="${t('listDelete')}">
            <span class="material-icons" aria-hidden="true">delete_outline</span>
          </button>
        </div>`;
      S.sketchListEl.appendChild(item);
    });
  }
}

export function hideHome(immediate) {
  if (!S.homePanel) return;
  if (immediate) {
    S.homePanel.classList.remove('panel-closing');
    S.homePanel.style.display = 'none';
  } else {
    F.hidePanelAnimated(S.homePanel);
  }
  // Deferred update: after panel animation completes, show empty state if applicable
  setTimeout(() => F.updateCanvasEmptyState(), 350);
}

// ── Projects Homepage & Project Canvas ────────────────────────────────────

/**
 * Render the home mode tab bar (Projects | My Sketches).
 * Inserts/updates a tab strip at the top of the home panel content area,
 * right after the header, so the user can quickly switch between views.
 * @param {'projects'|'sketches'} activeMode
 */
export function renderHomeModeTabs(activeMode) {
  if (!S.homePanel) return;
  let tabBar = S.homePanel.querySelector('.home-mode-tabs');
  if (!tabBar) {
    tabBar = document.createElement('div');
    tabBar.className = 'home-mode-tabs';
    tabBar.setAttribute('role', 'tablist');
    // Insert after header (before sync bar or sketch tabs)
    const header = S.homePanel.querySelector('.home-panel-header');
    if (header && header.nextSibling) {
      header.parentNode.insertBefore(tabBar, header.nextSibling);
    } else {
      S.homePanel.querySelector('.panel')?.prepend(tabBar);
    }
  }
  tabBar.innerHTML = `
    <button class="home-mode-tab${activeMode === 'projects' ? ' active' : ''}" data-home-mode="projects" role="tab" aria-selected="${activeMode === 'projects'}">
      <span class="material-icons" aria-hidden="true">dashboard</span>
      <span>${t('projectsTitle')}</span>
    </button>
    <button class="home-mode-tab${activeMode === 'sketches' ? ' active' : ''}" data-home-mode="sketches" role="tab" aria-selected="${activeMode === 'sketches'}">
      <span class="material-icons" aria-hidden="true">folder_open</span>
      <span>${t('homeTitle')}</span>
    </button>`;
  // Attach click handlers (always re-attach since innerHTML was replaced)
  tabBar.querySelectorAll('.home-mode-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      // Clear search when switching modes
      homeSearchQuery = '';
      const searchInput = S.homePanel?.querySelector('.home-search-bar__input');
      if (searchInput) searchInput.value = '';
      const mode = btn.getAttribute('data-home-mode');
      if (mode === 'projects') renderProjectsHome();
      else renderHome();
    });
  });
}

/**
 * Render the projects homepage in the homePanel container.
 * Shows organization projects as cards. Falls back to old sketch list
 * if user has no org or fetch fails.
 */
export async function renderProjectsHome() {
  if (!S.homePanel || !S.sketchListEl) {
    // Fallback: show old sketch list
    renderHome();
    return;
  }

  homeMode = 'projects';
  try { localStorage.setItem('homeMode', 'projects'); } catch { /* ignore */ }

  // Show the home panel with loading state
  S.startPanel.style.display = 'none';
  S.homePanel.classList.remove('panel-closing');
  S.homePanel.classList.add('home-panel--projects');
  S.homePanel.style.display = 'flex';

  // Update title and icon for projects landing page
  if (S.homeTitleEl) S.homeTitleEl.textContent = t('projectsTitle');
  const headerIcon = S.homePanel.querySelector('.home-panel-header-title .material-icons');
  if (headerIcon) headerIcon.textContent = 'dashboard';

  // Remove old subtitle if it exists
  const oldSubtitle = S.homePanel.querySelector('.home-panel-header-subtitle');
  if (oldSubtitle) oldSubtitle.remove();

  // Show close button so user can dismiss the panel and access the canvas
  const closeBtn = document.getElementById('homePanelCloseBtn');
  if (closeBtn) closeBtn.style.display = '';

  // Render top-level mode tabs (Projects | My Sketches) for quick switching
  renderHomeModeTabs('projects');

  // Search bar
  renderSearchBar();

  // Hide footer in projects mode (mode tabs replace the old footer button)
  const footer = S.homePanel.querySelector('.home-panel-footer');
  if (footer) footer.style.display = 'none';

  // Hide sketch tabs
  const sketchTabs = document.getElementById('sketchTabs');
  if (sketchTabs) sketchTabs.style.display = 'none';

  S.sketchListEl.innerHTML = `
    <div class="skeleton-cards" aria-busy="true" aria-label="${t('projectsLoading')}">
      <div class="skeleton-card"><div class="skeleton-icon"></div><div class="skeleton-lines"><div class="skeleton-line skeleton-line--title"></div><div class="skeleton-line skeleton-line--meta"></div></div></div>
      <div class="skeleton-card"><div class="skeleton-icon"></div><div class="skeleton-lines"><div class="skeleton-line skeleton-line--title"></div><div class="skeleton-line skeleton-line--meta"></div></div></div>
      <div class="skeleton-card"><div class="skeleton-icon"></div><div class="skeleton-lines"><div class="skeleton-line skeleton-line--title"></div><div class="skeleton-line skeleton-line--meta"></div></div></div>
    </div>`;

  try {
    const res = await fetch('/api/projects');
    if (!res.ok) throw new Error('Failed to fetch projects');
    const data = await res.json();
    let projects = data.projects || [];

    if (projects.length === 0) {
      // No projects: fall back to old sketch list
      renderHome();
      return;
    }

    // Apply search filter
    if (homeSearchQuery) {
      projects = projects.filter(p => {
        const name = (p.name || '').toLowerCase();
        const desc = (p.description || '').toLowerCase();
        return name.includes(homeSearchQuery) || desc.includes(homeSearchQuery);
      });
    }

    S.sketchListEl.innerHTML = '';

    if (projects.length === 0) {
      // Search returned no results
      S.sketchListEl.innerHTML = `
        <div class="sketch-list-empty">
          <span class="material-icons">search_off</span>
          <span>${t('home.noSearchResults')}</span>
        </div>`;
      return;
    }

    for (const project of projects) {
      const card = document.createElement('div');
      card.className = 'sketch-card project-card';
      const safeProjectId = escapeHtml(project.id);
      const safeProjectName = escapeHtml(project.name || (t('projects.homepage.untitledProject') || 'Untitled Project'));
      const safeProjectDescription = project.description ? escapeHtml(project.description) : '';
      const sketchCount = project.sketchCount || 0;
      const updatedDate = project.updatedAt ? new Date(project.updatedAt).toLocaleDateString(S.currentLang === 'he' ? 'he-IL' : 'en-GB') : '';
      card.innerHTML = `
        <div class="sketch-card-header">
          <div class="sketch-card-icon">
            <span class="material-icons">folder</span>
          </div>
          <div class="sketch-card-info">
            <div class="sketch-card-title">${safeProjectName}</div>
            <div class="sketch-card-meta">
              <span class="material-icons">layers</span>
              <span>${sketchCount} ${t('projects.homepage.sketches') || ''}</span>
              ${updatedDate ? `<span class="sketch-card-meta__sep"></span><span class="material-icons">schedule</span><span>${updatedDate}</span>` : ''}
            </div>
            ${safeProjectDescription ? `<div class="sketch-card-meta">${safeProjectDescription}</div>` : ''}
          </div>
        </div>
        <div class="sketch-card-actions">
          <button class="sketch-action-btn sketch-action-primary" data-action="openProject" data-id="${safeProjectId}">
            <span class="material-icons">open_in_new</span>
            <span>${t('projects.homepage.openProject') || 'Open Project'}</span>
          </button>
        </div>`;
      card.addEventListener('click', () => {
        location.hash = '#/project/' + project.id;
      });
      S.sketchListEl.appendChild(card);
    }
  } catch (err) {
    console.warn('[App] Failed to load projects, falling back to sketch list:', err.message);
    renderHome();
  }
}

/**
 * Reposition nodes in ALL project sketches using shared global ITM bounds.
 * This ensures every sketch's nodes are placed at their correct geographic
 * positions relative to each other on the canvas.
 */
export function repositionAllProjectSketchNodes(sketches) {
  if (window.__perfDebug) console.time('[PERF] reposition:extractCoords');
  // 1. First pass: extract ITM coords from all nodes across all sketches
  const allCoordinated = []; // [{node, surveyX, surveyY}]
  for (const sketch of sketches) {
    for (const node of (sketch.nodes || [])) {
      const itm = extractNodeItmCoordinates(node, wgs84ToItm);
      if (itm) {
        allCoordinated.push({ node, ...itm });
      }
    }
  }
  if (window.__perfDebug) console.timeEnd('[PERF] reposition:extractCoords');
  if (window.__perfDebug) console.log(`[PERF] reposition: ${allCoordinated.length} coordinated nodes out of ${sketches.reduce((s, sk) => s + (sk.nodes?.length || 0), 0)} total`);

  if (allCoordinated.length === 0) return;

  // 2. Compute global ITM bounds
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const { surveyX, surveyY } of allCoordinated) {
    if (surveyX < minX) minX = surveyX;
    if (surveyX > maxX) maxX = surveyX;
    if (surveyY < minY) minY = surveyY;
    if (surveyY > maxY) maxY = surveyY;
  }
  const globalBounds = { minX, maxX, minY, maxY };

  // Canvas dimensions
  const dpr = window.devicePixelRatio || 1;
  const logicalW = (S.canvas.width / dpr) || 800;
  const logicalH = (S.canvas.height / dpr) || 600;

  console.debug(`[ProjectCanvas] Global ITM bounds: X[${minX.toFixed(1)}, ${maxX.toFixed(1)}] Y[${minY.toFixed(1)}, ${maxY.toFixed(1)}]`);
  console.debug(`[ProjectCanvas] Repositioning ${sketches.length} sketches, ${allCoordinated.length} coordinated nodes`);

  // 3. Reposition each sketch's nodes
  if (window.__perfDebug) console.time('[PERF] reposition:repositionNodes');
  let firstReferencePoint = null;
  for (const sketch of sketches) {
    const sketchNodes = sketch.nodes || [];
    const sketchEdges = sketch.edges || [];

    // Save original positions for uncoordinated node placement
    const origPositions = new Map();
    for (const node of sketchNodes) {
      origPositions.set(String(node.id), { x: node.x, y: node.y });
    }

    // Reposition coordinated nodes
    for (const node of sketchNodes) {
      const itm = extractNodeItmCoordinates(node, wgs84ToItm);
      if (itm) {
        const pos = surveyToCanvas(itm.surveyX, itm.surveyY, globalBounds, logicalW, logicalH, { pixelsPerMeter: S.coordinateScale });
        node.x = pos.x;
        node.y = pos.y;
        node.surveyX = itm.surveyX;
        node.surveyY = itm.surveyY;
        node.hasCoordinates = true;
        node._hidden = false;

        if (!firstReferencePoint) {
          firstReferencePoint = {
            itm: { x: itm.surveyX, y: itm.surveyY },
            canvas: { x: pos.x, y: pos.y }
          };
        }
      } else {
        node._hidden = true;
      }
    }

    // Handle uncoordinated nodes — place relative to coordinated neighbors
    const hiddenNodes = sketchNodes.filter(n => n._hidden);
    if (hiddenNodes.length > 0) {
      const nodeMap = new Map();
      for (const n of sketchNodes) nodeMap.set(String(n.id), n);

      for (const node of hiddenNodes) {
        let placed = false;
        for (const edge of sketchEdges) {
          const tailId = String(edge.tail);
          const headId = String(edge.head);
          const nodeId = String(node.id);

          let neighborId = null;
          if (tailId === nodeId) neighborId = headId;
          else if (headId === nodeId) neighborId = tailId;
          if (!neighborId) continue;

          const neighbor = nodeMap.get(neighborId);
          if (!neighbor || neighbor._hidden) continue;

          const origNode = origPositions.get(String(node.id));
          const origNeighbor = origPositions.get(String(neighbor.id));
          if (origNode && origNeighbor) {
            const dx = origNode.x - origNeighbor.x;
            const dy = origNode.y - origNeighbor.y;
            node.x = neighbor.x + dx;
            node.y = neighbor.y + dy;
          } else {
            node.x = neighbor.x + 20;
            node.y = neighbor.y + 20;
          }
          node._hidden = false;
          placed = true;
          break;
        }
        if (!placed) {
          const coordNodes = sketchNodes.filter(n => !n._hidden && n !== node);
          if (coordNodes.length > 0) {
            const cx = coordNodes.reduce((s, n) => s + n.x, 0) / coordNodes.length;
            const cy = coordNodes.reduce((s, n) => s + n.y, 0) / coordNodes.length;
            node.x = cx + (Math.random() - 0.5) * 40;
            node.y = cy + (Math.random() - 0.5) * 40;
          }
          node._hidden = false;
        }
      }
    }
  }

  if (window.__perfDebug) console.timeEnd('[PERF] reposition:repositionNodes');

  // 4. Update active sketch state (geoNodePositions, coordinatesMap, etc.)
  if (window.__perfDebug) console.time('[PERF] reposition:updateState');
  for (const node of S.nodes) {
    S.geoNodePositions.set(String(node.id), { x: node.x, y: node.y });
    if (node.hasCoordinates && node.surveyX != null && node.surveyY != null) {
      S.coordinatesMap.set(String(node.id), { x: node.surveyX, y: node.surveyY, z: node.surveyZ || 0 });
    }
  }
  saveCoordinatesToStorage(S.coordinatesMap);

  // Enable coordinates mode
  if (!S.coordinatesEnabled) {
    S.coordinatesEnabled = true;
    saveCoordinatesEnabled(true);
    F.syncCoordinatesToggleUI();
  }

  // Set the map reference point from the first coordinated node
  if (firstReferencePoint) {
    setMapReferencePoint(firstReferencePoint);
    setStreetViewVisible(true);
  }

  if (window.__perfDebug) console.timeEnd('[PERF] reposition:updateState');

  // Zoom to fit ALL project nodes (not just active sketch)
  requestAnimationFrame(() => {
    if (window.__perfDebug) console.time('[PERF] reposition:zoomToFit');
    const allNodes = [];
    for (const sketch of sketches) {
      for (const n of (sketch.nodes || [])) {
        if (n && !n._hidden && typeof n.x === 'number' && typeof n.y === 'number') {
          allNodes.push(n);
        }
      }
    }
    if (allNodes.length < 2) { F.zoomToFit(); if (window.__perfDebug) console.timeEnd('[PERF] reposition:zoomToFit'); return; }

    let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
    for (const n of allNodes) {
      if (n.x < mnX) mnX = n.x;
      if (n.y < mnY) mnY = n.y;
      if (n.x > mxX) mxX = n.x;
      if (n.y > mxY) mxY = n.y;
    }
    const rangeX = (mxX - mnX) || 1;
    const rangeY = (mxY - mnY) || 1;
    const rect = S.canvas.getBoundingClientRect();
    const padding = 0.85;
    const scaleX = (rect.width * padding) / (rangeX * S.viewStretchX);
    const scaleY = (rect.height * padding) / (rangeY * S.viewStretchY);
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min(scaleX, scaleY)));
    const cx = (mnX + mxX) / 2;
    const cy = (mnY + mxY) / 2;
    S.viewScale = newScale;
    S.viewTranslate.x = rect.width / 2 - S.viewScale * S.viewStretchX * cx;
    S.viewTranslate.y = rect.height / 2 - S.viewScale * S.viewStretchY * cy;
    if (window.__perfDebug) console.timeEnd('[PERF] reposition:zoomToFit');
    F.scheduleDraw();
  });
}

/**
 * Enter project-canvas mode: load all sketches for a project onto the canvas.
 *
 * Shows a full-screen loading overlay with step progress, fetches sketches and
 * layers in parallel, prepares the canvas, and then pre-caches map tiles in
 * the background after the overlay closes.
 */
export async function loadProjectCanvas(projectId) {
  // Long Task observer — detects ANY >50ms main-thread block (debug only)
  let _longTaskObserver;
  if (window.__perfDebug && typeof PerformanceObserver !== 'undefined') {
    try {
      _longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          console.warn(`[PERF] LONG TASK detected: ${entry.duration.toFixed(0)}ms at ${entry.startTime.toFixed(0)}ms`, entry);
        }
      });
      _longTaskObserver.observe({ type: 'longtask', buffered: false });
    } catch (_) { /* longtask not supported */ }
  }

  // 1. Show loading overlay IMMEDIATELY (before anything else)
  showProjectLoadingOverlay();
  updateLoadingStep('sketches', 'loading');
  updateLoadingStep('layers', 'loading');

  try {
    const _t0 = performance.now();
    if (window.__perfDebug) console.time('[PERF] loadProjectCanvas TOTAL');
    if (window.__perfDebug) console.log(`[PERF] ▶ loadProjectCanvas START at ${_t0.toFixed(0)}ms since page load`);

    hideHome(true); // Immediate hide to prevent sync-service race condition

    // 2. Fetch sketches AND layers in parallel
    if (window.__perfDebug) console.time('[PERF] parallel fetch (sketches + layers)');

    const [sketches, layersResult] = await Promise.all([
      loadProjectSketches(projectId).catch(err => {
        updateLoadingStep('sketches', 'error', t('projects.canvas.loadingError'));
        throw err;
      }),
      loadProjectReferenceLayers(projectId).then(result => {
        const count = result?.layerCount ?? 0;
        updateLoadingStep('layers', 'done', t('projects.canvas.loadingLayersDone', count));
        return result;
      }).catch(err => {
        console.warn('[ProjectLoading] Layer loading failed (non-fatal):', err.message);
        updateLoadingStep('layers', 'error');
        return { layerCount: 0 };
      }),
    ]);

    if (window.__perfDebug) console.timeEnd('[PERF] parallel fetch (sketches + layers)');

    // Update sketches step with result
    const totalNodes = sketches.reduce((s, sk) => s + (sk.nodes?.length || 0), 0);
    const totalEdges = sketches.reduce((s, sk) => s + (sk.edges?.length || 0), 0);
    updateLoadingStep('sketches', 'done', t('projects.canvas.loadingSketchesDone', sketches.length));
    if (window.__perfDebug) console.log(`[PERF] Loaded ${sketches.length} sketches, total nodes: ${totalNodes}, total edges: ${totalEdges}`);

    if (sketches.length === 0) {
      F.showToast(t('projects.homepage.empty') || 'No sketches in this project', 'warning');
      forceCloseProjectLoadingOverlay();
      location.hash = '#/';
      if (window.__perfDebug) console.timeEnd('[PERF] loadProjectCanvas TOTAL');
      return;
    }

    // 3. Prepare canvas (sync work)
    updateLoadingStep('canvas', 'loading');

    if (window.__perfDebug) console.time('[PERF] syncProjectSketchesToLibrary');
    syncProjectSketchesToLibrary();
    if (window.__perfDebug) console.timeEnd('[PERF] syncProjectSketchesToLibrary');

    if (window.__perfDebug) console.time('[PERF] repositionAllProjectSketchNodes');
    repositionAllProjectSketchNodes(sketches);
    if (window.__perfDebug) console.timeEnd('[PERF] repositionAllProjectSketchNodes');

    if (window.__perfDebug) console.time('[PERF] showSketchSidePanel');
    showSketchSidePanel();
    if (window.__perfDebug) console.timeEnd('[PERF] showSketchSidePanel');

    F.scheduleDraw();
    updateLoadingStep('canvas', 'done', t('projects.canvas.loadingCanvasDone'));

    if (window.__perfDebug) console.timeEnd('[PERF] loadProjectCanvas TOTAL');
    if (window.__perfDebug) console.log(`[PERF] ■ loadProjectCanvas END at ${performance.now().toFixed(0)}ms since page load (wall: ${(performance.now() - _t0).toFixed(0)}ms)`);

    // 4. Hide overlay with a brief delay for the last step animation
    await new Promise(r => setTimeout(r, 300));
    await hideProjectLoadingOverlay();

    // 5. Pre-cache map tiles in background (non-blocking)
    updateLoadingStep('tiles', 'loading');
    precacheProjectTiles(sketches);

    // Detect if main thread stays blocked after we return
    const _tReturn = performance.now();
    if (window.__perfDebug) setTimeout(() => {
      const delay = performance.now() - _tReturn;
      console.log(`[PERF] ⚠ setTimeout(0) fired after ${delay.toFixed(0)}ms — if >100ms, main thread was blocked`);
    }, 0);

    // Stop long task observer after 5s
    if (_longTaskObserver) setTimeout(() => { _longTaskObserver.disconnect(); console.log('[PERF] Long task observer stopped'); }, 5000);

    F.showToast(`${sketches.length} ${t('projects.canvas.sketches') || 'sketches loaded'}`);
  } catch (err) {
    console.error('[App] Failed to load project canvas:', err);
    F.showToast(err.message || t('projects.canvas.loadError'), 'error');
    forceCloseProjectLoadingOverlay();
  }
}

/**
 * Pre-cache map tiles for the project's geographic extent.
 * Runs in the background — does not block the UI.
 * @param {Array} sketches - Array of sketch objects with nodes
 */
export function precacheProjectTiles(sketches) {
  try {
    // Extract ITM bounds from all coordinated nodes across all sketches
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let coordCount = 0;

    for (const sketch of sketches) {
      for (const node of (sketch.nodes || [])) {
        const itm = extractNodeItmCoordinates(node, wgs84ToItm);
        if (itm) {
          if (itm.surveyX < minX) minX = itm.surveyX;
          if (itm.surveyX > maxX) maxX = itm.surveyX;
          if (itm.surveyY < minY) minY = itm.surveyY;
          if (itm.surveyY > maxY) maxY = itm.surveyY;
          coordCount++;
        }
      }
    }

    if (coordCount < 2) {
      updateLoadingStep('tiles', 'done', t('projects.canvas.loadingTilesDone', 0));
      return;
    }

    const itmBounds = { minX, maxX, minY, maxY };
    console.debug(`[ProjectTiles] Pre-caching tiles for ITM bounds: X[${minX.toFixed(1)}, ${maxX.toFixed(1)}] Y[${minY.toFixed(1)}, ${maxY.toFixed(1)}], ${coordCount} nodes`);

    // Use the existing precache function with a progress callback
    precacheTilesForMeasurementBounds(itmBounds, 100, (loaded, total) => {
      if (loaded === total) {
        updateLoadingStep('tiles', 'done', t('projects.canvas.loadingTilesDone', loaded));
      }
    });
  } catch (err) {
    console.warn('[ProjectTiles] Tile pre-cache failed (non-fatal):', err.message);
    updateLoadingStep('tiles', 'error');
  }
}

export async function handleChangeProject(sketchId) {
  try {
    const authState = window.authGuard?.getAuthState?.() || {};
    if (!authState.isSignedIn) {
      F.showToast(t('auth.loginSubtitle'), 'error');
      return;
    }

    // Fetch available projects
    const response = await fetch('/api/projects');
    if (!response.ok) throw new Error('Failed to fetch projects');
    const data = await response.json();
    const projects = data.projects || [];

    if (projects.length === 0) {
      F.showToast(t('projects.noProjects'), 'warning');
      return;
    }

    // Get current sketch to find current project
    const lib = getLibrary();
    const sketch = lib.find(s => s.id === sketchId);
    const sketchProjectId = sketch?.projectId;

    // Create modal
    const overlay = document.createElement('div');
    overlay.className = 'projects-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'projects-modal';

    modal.innerHTML = `
      <div class="projects-modal-header">
        <h3>${t('listChangeProject')}</h3>
        <button class="btn-icon projects-modal-close">
          <span class="material-icons">close</span>
        </button>
      </div>
      <div class="projects-modal-body">
        <div class="form-group">
          <label for="projectSelect">${t('labels.selectProject')}</label>
          <select id="projectSelect" class="form-input">
            <option value="">-- ${t('labels.selectProject')} --</option>
            ${projects.map(p => `
              <option value="${escapeHtml(p.id)}" ${p.id === sketchProjectId ? 'selected' : ''}>
                ${escapeHtml(p.name)}
              </option>
            `).join('')}
          </select>
        </div>
        <div class="form-group checkbox-group" style="margin-top: 15px; display: flex; align-items: center;">
          <input type="checkbox" id="updateConfigCheck" checked>
          <label for="updateConfigCheck" style="margin-left: 8px; margin-right: 8px;">
            ${t('projects.updateInputFlow')}
          </label>
        </div>
      </div>
      <div class="projects-modal-footer">
        <button class="btn btn-secondary projects-modal-cancel">${t('buttons.cancel')}</button>
        <button class="btn btn-primary projects-modal-save">${t('buttons.save')}</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    modal.querySelector('.projects-modal-close').addEventListener('click', closeModal);
    modal.querySelector('.projects-modal-cancel').addEventListener('click', closeModal);

    modal.querySelector('.projects-modal-save').addEventListener('click', async () => {
      const select = modal.querySelector('#projectSelect');
      const projectId = select.value;
      const updateConfig = modal.querySelector('#updateConfigCheck').checked;

      // Allow selecting empty value to unassign project
      // if (!projectId) ... (Optional: decide if project is required. Current logic suggests we can assign to a project or not, but usually we want to assign)
      // If user selects "Select Project" (empty), maybe we should warn or allow unassigning?
      // The option value is "" for default.
      // Let's assume user wants to assign a project.

      if (!projectId) {
         // If they want to unassign, they can pick empty? Or maybe we enforce selection.
         // Let's enforce selection for now based on "Change Project".
         F.showToast(t('alerts.selectProject'), 'error');
         return;
      }

      try {
        const res = await fetch(`/api/sketches/${sketchId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            updateInputFlowSnapshot: updateConfig
          })
        });

        if (!res.ok) throw new Error('Failed to update sketch project');

        const updatedData = await res.json();
        const updatedSketch = updatedData.sketch;

        // Update local library
        const lib = getLibrary();
        const idx = lib.findIndex(s => s.id === sketchId);
        if (idx !== -1) {
          lib[idx] = { ...lib[idx], ...updatedSketch };
          setLibrary(lib);
          // Persist and Sync
          idbSaveRecordCompat(lib[idx]);

          // If this is the active sketch, update the runtime state immediately
          if (S.currentSketchId === sketchId) {
            S.currentProjectId = updatedSketch.projectId || null;
            S.currentInputFlowConfig = updatedSketch.inputFlowConfig || DEFAULT_INPUT_FLOW_CONFIG;
            loadProjectReferenceLayers(S.currentProjectId);
            F.saveToStorage();
          }
        }

        renderHome();
        F.showToast(t('toasts.saved'));
        closeModal();
      } catch (err) {
        console.error('[Projects] Failed to save project assignment:', err.message);
        F.showToast(err.message, 'error');
      }
    });

  } catch (err) {
    console.error('[Projects] Error loading projects:', err.message);
    F.showToast(t('projects.loadError'), 'error');
  }
}
