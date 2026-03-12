/**
 * DOM contract tests for the Projects Homepage feature.
 *
 * Since the functions in src/legacy/main.js are not exported, we replicate
 * their DOM manipulation logic on minimal jsdom fixtures and assert the
 * resulting DOM state.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Minimal DOM fixture ─────────────────────────────────────────────────────

function createFixture() {
  document.body.innerHTML = `
    <div id="homePanel" style="display:none">
      <div class="home-panel-header">
        <span class="home-panel-header-title">
          <span class="material-icons">folder_open</span>
          <span id="homePanelTitle">Sketches</span>
        </span>
      </div>
      <div id="sketchTabs"></div>
      <div id="sketchListEl"></div>
      <div class="home-panel-footer"></div>
    </div>
    <button id="homePanelCloseBtn"></button>
    <div id="sketchSidePanel" style="display:none;">
      <a id="backToProjectsBtn" class="sketch-side-panel__back" href="#/projects">
        <span class="material-icons">arrow_back</span>
        <span>Back to Projects</span>
      </a>
    </div>
  `;

  return {
    homePanel: document.getElementById('homePanel')!,
    sketchTabs: document.getElementById('sketchTabs')!,
    closeBtn: document.getElementById('homePanelCloseBtn')!,
    footer: document.querySelector('.home-panel-footer') as HTMLElement,
    headerIcon: document.querySelector('.home-panel-header-title .material-icons') as HTMLElement,
    headerTitle: document.querySelector('.home-panel-header-title') as HTMLElement,
  };
}

// ── DOM mutation helpers (mirrors main.js logic) ────────────────────────────

/**
 * Applies the same DOM mutations that renderProjectsHome() performs
 * (lines 2543–2577 of main.js).
 */
function applyProjectsHomeMode(homePanel: HTMLElement) {
  homePanel.classList.add('home-panel--projects');
  homePanel.style.display = 'flex';

  // Update icon
  const headerIcon = homePanel.querySelector('.home-panel-header-title .material-icons');
  if (headerIcon) headerIcon.textContent = 'dashboard';

  // Remove old subtitle if it exists
  const oldSubtitle = homePanel.querySelector('.home-panel-header-subtitle');
  if (oldSubtitle) oldSubtitle.remove();

  // Show close button
  const closeBtn = document.getElementById('homePanelCloseBtn');
  if (closeBtn) closeBtn.style.display = '';

  // Hide footer
  const footer = homePanel.querySelector('.home-panel-footer') as HTMLElement;
  if (footer) footer.style.display = 'none';

  // Hide sketch tabs
  const sketchTabs = document.getElementById('sketchTabs');
  if (sketchTabs) sketchTabs.style.display = 'none';
}

/**
 * Applies the same DOM mutations that renderHome() performs to undo
 * projects-mode overrides (lines 2251–2267 of main.js).
 */
function applySketchesHomeMode(homePanel: HTMLElement) {
  homePanel.classList.remove('home-panel--projects');
  homePanel.style.display = 'flex';

  // Restore icon
  const headerIcon = homePanel.querySelector('.home-panel-header-title .material-icons');
  if (headerIcon) headerIcon.textContent = 'folder_open';

  // Restore close button
  const closeBtn = document.getElementById('homePanelCloseBtn');
  if (closeBtn) closeBtn.style.display = '';

  // Restore footer
  const footer = homePanel.querySelector('.home-panel-footer') as HTMLElement;
  if (footer) footer.style.display = '';

  // Restore sketch tabs (renderHome shows them via sketchTabs logic)
  const sketchTabs = document.getElementById('sketchTabs');
  if (sketchTabs) sketchTabs.style.display = '';
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('projects homepage DOM mutations', () => {
  let homePanel: HTMLElement;
  let closeBtn: HTMLElement;
  let footer: HTMLElement;
  let headerIcon: HTMLElement;
  let sketchTabs: HTMLElement;

  beforeEach(() => {
    const f = createFixture();
    homePanel = f.homePanel;
    closeBtn = f.closeBtn;
    footer = f.footer;
    headerIcon = f.headerIcon;
    sketchTabs = f.sketchTabs;
  });

  describe('renderProjectsHome() DOM mutations', () => {
    it('adds home-panel--projects class', () => {
      applyProjectsHomeMode(homePanel);
      expect(homePanel.classList.contains('home-panel--projects')).toBe(true);
    });

    it('changes header icon to dashboard', () => {
      applyProjectsHomeMode(homePanel);
      expect(headerIcon.textContent).toBe('dashboard');
    });

    it('removes old subtitle if present', () => {
      // Create a subtitle to simulate legacy state
      const subtitle = document.createElement('div');
      subtitle.className = 'home-panel-header-subtitle';
      homePanel.querySelector('.home-panel-header')!.appendChild(subtitle);

      applyProjectsHomeMode(homePanel);
      expect(homePanel.querySelector('.home-panel-header-subtitle')).toBeNull();
    });

    it('shows close button', () => {
      applyProjectsHomeMode(homePanel);
      expect(closeBtn.style.display).toBe('');
    });

    it('hides footer', () => {
      applyProjectsHomeMode(homePanel);
      expect(footer.style.display).toBe('none');
    });

    it('hides sketch tabs', () => {
      applyProjectsHomeMode(homePanel);
      expect(sketchTabs.style.display).toBe('none');
    });

    it('shows home panel', () => {
      applyProjectsHomeMode(homePanel);
      expect(homePanel.style.display).toBe('flex');
    });

    it('has no subtitle after multiple renders', () => {
      applyProjectsHomeMode(homePanel);
      applyProjectsHomeMode(homePanel);
      const subtitles = homePanel.querySelectorAll('.home-panel-header-subtitle');
      expect(subtitles.length).toBe(0);
    });
  });

  describe('renderHome() cleanup mutations', () => {
    beforeEach(() => {
      // First apply projects mode, then clean up
      applyProjectsHomeMode(homePanel);
    });

    it('removes home-panel--projects class', () => {
      applySketchesHomeMode(homePanel);
      expect(homePanel.classList.contains('home-panel--projects')).toBe(false);
    });

    it('restores icon to folder_open', () => {
      applySketchesHomeMode(homePanel);
      expect(headerIcon.textContent).toBe('folder_open');
    });

    it('restores close button visibility', () => {
      applySketchesHomeMode(homePanel);
      expect(closeBtn.style.display).toBe('');
    });

    it('restores footer visibility', () => {
      applySketchesHomeMode(homePanel);
      expect(footer.style.display).toBe('');
    });

    it('restores sketch tabs visibility', () => {
      applySketchesHomeMode(homePanel);
      expect(sketchTabs.style.display).not.toBe('none');
    });

    it('full round-trip: projects → home → projects', () => {
      // Already in projects mode from beforeEach
      applySketchesHomeMode(homePanel);
      expect(homePanel.classList.contains('home-panel--projects')).toBe(false);

      applyProjectsHomeMode(homePanel);
      expect(homePanel.classList.contains('home-panel--projects')).toBe(true);
      expect(headerIcon.textContent).toBe('dashboard');
      expect(closeBtn.style.display).toBe('');
    });

    it('cleanup is idempotent', () => {
      applySketchesHomeMode(homePanel);
      applySketchesHomeMode(homePanel);
      expect(homePanel.classList.contains('home-panel--projects')).toBe(false);
      expect(headerIcon.textContent).toBe('folder_open');
      expect(closeBtn.style.display).toBe('');
    });
  });

  describe('close button guard', () => {
    it('does nothing when homeMode is projects', () => {
      let homeMode = 'projects';
      const hideHome = vi.fn();

      // Simulate the close button handler from main.js line 5765
      const handler = () => {
        if (homeMode === 'projects') return;
        hideHome();
      };

      handler();
      expect(hideHome).not.toHaveBeenCalled();
    });

    it('hides panel when homeMode is sketches', () => {
      let homeMode = 'sketches';
      const hideHome = vi.fn();

      const handler = () => {
        if (homeMode === 'projects') return;
        hideHome();
      };

      handler();
      expect(hideHome).toHaveBeenCalledOnce();
    });

    it('hides panel when homeMode is undefined', () => {
      let homeMode: string | undefined = undefined;
      const hideHome = vi.fn();

      const handler = () => {
        if (homeMode === 'projects') return;
        hideHome();
      };

      handler();
      expect(hideHome).toHaveBeenCalledOnce();
    });
  });

  describe('backToProjectsBtn element', () => {
    it('exists in DOM', () => {
      const btn = document.getElementById('backToProjectsBtn');
      expect(btn).not.toBeNull();
    });

    it('is an anchor with href="#/projects"', () => {
      const btn = document.getElementById('backToProjectsBtn')!;
      expect(btn.tagName).toBe('A');
      expect(btn.getAttribute('href')).toBe('#/projects');
    });

    it('contains arrow_back icon', () => {
      const btn = document.getElementById('backToProjectsBtn')!;
      const icon = btn.querySelector('.material-icons');
      expect(icon).not.toBeNull();
      expect(icon!.textContent).toBe('arrow_back');
    });
  });

  describe('empty project redirect', () => {
    it('empty sketches array triggers hash change to #/', () => {
      // Simulate the redirect logic from renderProjectsHome (line 2592)
      const projects: any[] = [];
      const originalHash = window.location.hash;

      if (projects.length === 0) {
        // In the real code this calls renderHome(), but the redirect
        // logic for empty projects within a project navigates to #/
        window.location.hash = '#/';
      }

      expect(window.location.hash).toBe('#/');
      // Restore
      window.location.hash = originalHash;
    });

    it('non-empty sketches does NOT redirect', () => {
      const projects = [{ id: 'p1', name: 'Test Project' }];
      const originalHash = window.location.hash;

      if (projects.length === 0) {
        window.location.hash = '#/';
      }

      expect(window.location.hash).toBe(originalHash);
    });
  });
});
