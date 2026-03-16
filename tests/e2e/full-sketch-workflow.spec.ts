/**
 * Full Sketch Workflow E2E Test — UX Audit
 *
 * Simulates a real user: login → place nodes → draw edges → edit data → verify.
 * Captures timing, UI friction, and generates a severity-ranked audit report.
 */
import { test, expect, type Page } from '@playwright/test';
import { mockAuthUser, gotoCanvasReady, dismissHomePanel } from './helpers';
import * as fs from 'fs';
import * as path from 'path';

// ── Collectors ──────────────────────────────────────────────────────────────

interface TimingEntry { action: string; durationMs: number; status: 'ok' | 'slow' | 'failed'; note?: string; }
interface UiIssue { severity: 'critical' | 'major' | 'minor' | 'cosmetic'; category: string; description: string; evidence?: string; }

let timings: TimingEntry[] = [];
let issues: UiIssue[] = [];

function recordTiming(action: string, ms: number, threshold = 500, note?: string) {
  const status = ms > threshold ? 'slow' : 'ok';
  timings.push({ action, durationMs: ms, status, note });
  if (status === 'slow') {
    issues.push({ severity: ms > 2000 ? 'major' : 'minor', category: 'Performance', description: `"${action}" took ${ms}ms (threshold: ${threshold}ms)`, evidence: note });
  }
}

function issue(severity: UiIssue['severity'], category: string, description: string, evidence?: string) {
  issues.push({ severity, category, description, evidence });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function clickCanvas(page: Page, xOff: number, yOff: number) {
  const box = await page.locator('#graphCanvas').boundingBox();
  if (!box) throw new Error('Canvas not found');
  await page.mouse.click(box.x + box.width / 2 + xOff, box.y + box.height / 2 + yOff);
  await page.waitForTimeout(100);
}

async function activateMode(page: Page, mode: string) {
  const map: Record<string, string> = { node: '#nodeModeBtn', edge: '#edgeModeBtn', home: '#homeNodeModeBtn', drainage: '#drainageNodeModeBtn', issue: '#issueNodeModeBtn' };
  await page.evaluate((sel) => (document.querySelector(sel) as HTMLElement)?.click(), map[mode]);
  await page.waitForTimeout(100);
}

async function getSketchState(page: Page) {
  return page.evaluate(() => {
    const d = localStorage.getItem('currentSketch');
    if (!d) return { nodes: 0, edges: 0, types: [] as string[] };
    try {
      const p = JSON.parse(d);
      return { nodes: p.nodes?.length ?? 0, edges: p.edges?.length ?? 0, types: [...new Set((p.nodes ?? []).map((n: any) => n.nodeType))] as string[] };
    } catch { return { nodes: 0, edges: 0, types: [] as string[] }; }
  });
}

async function sidebarOpen(page: Page) {
  return page.evaluate(() => document.getElementById('sidebar')?.classList.contains('open') ?? false);
}

async function waitSidebar(page: Page, open: boolean, ms = 2000) {
  try {
    await page.waitForFunction((o) => {
      const s = document.getElementById('sidebar');
      return o ? s?.classList.contains('open') : !s?.classList.contains('open');
    }, open, { timeout: ms });
    return true;
  } catch { return false; }
}

async function getCurrentMode(page: Page) {
  return page.evaluate(() => {
    for (const [id, m] of [['nodeModeBtn','node'],['edgeModeBtn','edge'],['homeNodeModeBtn','home'],['drainageNodeModeBtn','drainage'],['issueNodeModeBtn','issue']]) {
      if (document.getElementById(id)?.classList.contains('active')) return m;
    }
    return 'unknown';
  });
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `test-results/workflow-${name}.png`, fullPage: false });
}

/** Aggressively dismiss home panel + any overlays including auth loading */
async function nukeOverlays(page: Page) {
  // Try close button first
  const closeBtn = page.locator('#homePanelCloseBtn');
  if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeBtn.click();
    await page.waitForTimeout(300);
  }
  // Force hide ALL overlays via JS — including auth loading overlay
  await page.evaluate(() => {
    // Kill the auth loading overlay that says "בודק הרשאות..."
    const authOverlay = document.getElementById('authLoadingOverlay');
    if (authOverlay) {
      authOverlay.style.display = 'none';
      authOverlay.remove();
    }
    for (const id of ['homePanel', 'startPanel', 'helpModal', 'adminModal', 'loginPanel']) {
      const el = document.getElementById(id);
      if (el) { el.style.cssText = 'display:none!important;visibility:hidden!important;pointer-events:none!important;opacity:0!important;z-index:-9999!important;'; el.remove(); }
    }
    document.querySelectorAll('.panel-backdrop,.modal-backdrop,.overlay,.auth-loading-overlay').forEach(e => (e as HTMLElement).remove());
    // Close export dropdown if open
    const dd = document.getElementById('exportDropdown');
    if (dd) dd.style.display = 'none';
    // Remove any other full-screen overlays
    document.querySelectorAll('[style*="position: fixed"], [style*="position:fixed"]').forEach(el => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      if (rect.width > window.innerWidth * 0.8 && rect.height > window.innerHeight * 0.8) {
        const tag = (el as HTMLElement).tagName.toLowerCase();
        if (tag !== 'header' && tag !== 'main' && !el.id?.includes('canvas')) {
          (el as HTMLElement).style.display = 'none';
        }
      }
    });
  });
  await page.waitForTimeout(200);
}

// ── Test ────────────────────────────────────────────────────────────────────

test.use({ contextOptions: { reducedMotion: 'reduce' } });
test.describe.configure({ timeout: 300_000 }); // 5 minutes

test.describe('Full Sketch Workflow — Severe UX Audit', () => {
  test.beforeEach(async ({ page }) => {
    timings = [];
    issues = [];
    await mockAuthUser(page);
    await page.addInitScript(() => { localStorage.clear(); });
  });

  test('complete sketch workflow with data entry', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 1: App Load
    // ═══════════════════════════════════════════════════════════════════════
    const t0 = Date.now();
    await gotoCanvasReady(page);
    // Wait extra for auth loading overlay to naturally dismiss
    try {
      await page.waitForFunction(
        () => {
          const overlay = document.getElementById('authLoadingOverlay');
          return !overlay || overlay.style.display === 'none' || overlay.offsetHeight === 0;
        },
        { timeout: 10000 }
      );
    } catch {
      // Will nuke it below
    }
    recordTiming('App load → canvas ready', Date.now() - t0, 5000);

    // ── Audit: Home panel behavior ──
    const homePanelBlocks = await page.evaluate(() => {
      const hp = document.getElementById('homePanel');
      if (!hp || hp.offsetHeight === 0) return false;
      const rect = hp.getBoundingClientRect();
      const canvas = document.getElementById('graphCanvas')?.getBoundingClientRect();
      return canvas ? (rect.width > 200 && rect.height > 200) : false;
    });
    if (homePanelBlocks) {
      issue('major', 'Onboarding', 'Home panel covers the canvas on first load. New users must find and click X before they can draw anything. The "New Sketch" button is at the bottom of the panel — below the fold on mobile.');
    }

    await nukeOverlays(page);
    await shot(page, '01-canvas-ready');

    // Verify canvas is actually the top element at center
    const canvasIsTop = await page.evaluate(() => {
      const c = document.getElementById('graphCanvas');
      if (!c) return false;
      const r = c.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return top === c || top?.closest('#canvasContainer') !== null;
    });
    if (!canvasIsTop) {
      issue('critical', 'Layout', 'Canvas center is occluded even after removing overlays — something is blocking user interaction with the drawing surface');
    }

    // ── Audit: Empty state ──
    const emptyState = await page.evaluate(() => {
      const es = document.getElementById('canvasEmptyState');
      if (!es) return { exists: false, visible: false, text: '' };
      return { exists: true, visible: es.offsetHeight > 0 && getComputedStyle(es).display !== 'none', text: es.textContent?.trim() ?? '' };
    });
    if (!emptyState.exists) {
      issue('major', 'Onboarding', 'No empty state element exists in DOM — first-time users see a blank white canvas with no hint what to do');
    } else if (!emptyState.visible) {
      issue('major', 'Onboarding', 'Empty state hint exists but is not visible — the hint element is in the DOM but CSS hides it');
    }

    // ── Audit: Toolbar & buttons ──
    const toolbarInfo = await page.evaluate(() => {
      const toolbar = document.querySelector('.canvas-toolbar');
      const nodeBtn = document.getElementById('nodeModeBtn');
      const edgeBtn = document.getElementById('edgeModeBtn');
      return {
        toolbarVisible: toolbar ? toolbar.getBoundingClientRect().height > 0 : false,
        nodeBtnTitle: nodeBtn?.getAttribute('title') ?? nodeBtn?.getAttribute('aria-label') ?? '',
        edgeBtnTitle: edgeBtn?.getAttribute('title') ?? edgeBtn?.getAttribute('aria-label') ?? '',
        nodeBtnVisible: nodeBtn ? nodeBtn.offsetHeight > 0 : false,
        edgeBtnVisible: edgeBtn ? edgeBtn.offsetHeight > 0 : false,
      };
    });
    if (!toolbarInfo.nodeBtnTitle) issue('minor', 'Accessibility', 'Node mode button has no title/aria-label — icon-only button with no tooltip or screen reader text');
    if (!toolbarInfo.edgeBtnTitle) issue('minor', 'Accessibility', 'Edge mode button has no title/aria-label');

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 2: Place 4 Manhole Nodes
    // ═══════════════════════════════════════════════════════════════════════
    const t1 = Date.now();
    await activateMode(page, 'node');
    const modeAfterClick = await getCurrentMode(page);
    recordTiming('Activate node mode', Date.now() - t1, 300);

    if (modeAfterClick !== 'node') {
      issue('major', 'Interaction', `Clicking node mode button did not activate node mode (got "${modeAfterClick}"). Mode switching may be broken in E2E.`);
    }

    // Place nodes at 4 corners
    const positions = [
      { x: -80, y: -80 }, { x: 80, y: -80 },
      { x: 80, y: 80 }, { x: -80, y: 80 },
    ];
    for (const p of positions) {
      await clickCanvas(page, p.x, p.y);
      await page.waitForTimeout(100);
    }

    let state = await getSketchState(page);
    const nodesCreatedByClicks = state.nodes;
    if (nodesCreatedByClicks < 4) {
      issue('critical', 'Core Functionality', `Only ${nodesCreatedByClicks}/4 nodes created via canvas clicks. Click→create pipeline broken.`);
      // Fallback: create nodes via JS to continue the test
      if (nodesCreatedByClicks === 0) {
        issue('critical', 'Core Functionality', 'Zero nodes created — canvas click handler is completely non-functional in headless mode. Creating nodes via JS to continue audit.');
        await page.evaluate(() => {
          // @ts-ignore — calling internal functions
          const w = window as any;
          if (typeof w.__createTestNodes === 'function') w.__createTestNodes();
        });
      }
    }

    // Audit: no feedback after placement
    const sidebarAfterPlace = await sidebarOpen(page);
    if (sidebarAfterPlace) {
      issue('cosmetic', 'Workflow', 'Sidebar opened after placing manhole node — node mode should be rapid-placement only');
    }

    await shot(page, '02-nodes-placed');

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 3: Draw 3 Edges
    // ═══════════════════════════════════════════════════════════════════════
    const t2 = Date.now();
    await activateMode(page, 'edge');
    recordTiming('Activate edge mode', Date.now() - t2, 300);

    const edgeBtnActive = await page.evaluate(() =>
      document.getElementById('edgeModeBtn')?.classList.contains('active') ?? false
    );
    if (!edgeBtnActive) {
      issue('major', 'Feedback', 'Edge mode button does not show active state — user cannot tell which drawing mode they are in');
    }

    // Draw edges: 0→1, 1→2, 2→3
    const edgePairs = [[0,1],[1,2],[2,3]];
    for (const [a, b] of edgePairs) {
      await clickCanvas(page, positions[a].x, positions[a].y);
      await page.waitForTimeout(150);
      await clickCanvas(page, positions[b].x, positions[b].y);
      await page.waitForTimeout(150);
    }

    state = await getSketchState(page);
    const edgesCreated = state.edges;
    if (edgesCreated < 3) {
      issue('critical', 'Core Functionality', `Only ${edgesCreated}/3 edges created. Node hit-detection in edge mode likely too small — user must click pixel-perfect on the node center. On touch devices this is nearly impossible without the expanded touch radius.`);
    }

    await shot(page, '03-edges-drawn');

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 4: Select Node → Edit Data
    // ═══════════════════════════════════════════════════════════════════════
    await activateMode(page, 'node');
    await page.waitForTimeout(100);

    // Click on node to select
    const t3 = Date.now();
    await clickCanvas(page, positions[0].x, positions[0].y);
    let opened = await waitSidebar(page, true, 1500);

    if (!opened) {
      // First click selects, second click should toggle details
      await clickCanvas(page, positions[0].x, positions[0].y);
      opened = await waitSidebar(page, true, 1500);
      if (opened) {
        issue('major', 'Interaction', 'Sidebar requires TWO clicks to open — first click selects node (no visible feedback), second opens details. Users expect single-tap-to-edit. This doubles the interaction cost for every node edit.');
      }
    }
    recordTiming('Select node → sidebar', Date.now() - t3, 1500);

    if (!opened) {
      issue('critical', 'Sidebar', 'Sidebar never opened after clicking node. Cannot edit node properties. The entire data-entry workflow is broken.');
    }

    await shot(page, '04-node-selected');

    // ── Audit sidebar form ──
    if (await sidebarOpen(page)) {
      const formAudit = await page.evaluate(() => {
        const c = document.getElementById('detailsContainer');
        if (!c) return null;
        const inputs = c.querySelectorAll('input, select, textarea');
        const labels = Array.from(c.querySelectorAll('label')).map(l => l.textContent?.trim()).filter(Boolean);
        const tabs = c.querySelectorAll('[role="tab"], .wizard-tab, .tab-btn, .details-tab');
        const selects = Array.from(c.querySelectorAll('select')).map(s => ({
          id: s.id || s.getAttribute('data-field') || 'unknown',
          options: s.options.length,
          hasPlaceholder: s.options[0]?.value === '' || s.options[0]?.disabled,
        }));
        return {
          html: c.innerHTML.substring(0, 500),
          inputCount: inputs.length,
          labelCount: labels.length,
          labels,
          tabCount: tabs.length,
          hasIdInput: !!c.querySelector('#idInput'),
          hasDeleteBtn: !!c.querySelector('#deleteNodeBtn'),
          hasSaveNext: !!c.querySelector('.save-next-btn'),
          selects,
          // Check for inline validation
          hasValidation: !!c.querySelector('[aria-invalid], .error, .invalid, .validation-error'),
          // Check for field descriptions/help text
          hasHelpText: !!c.querySelector('.help-text, .field-description, [aria-describedby]'),
        };
      });

      if (!formAudit) {
        issue('critical', 'Sidebar', 'Details container is null — sidebar opened but has no form content');
      } else {
        if (formAudit.inputCount === 0) {
          issue('critical', 'Sidebar', 'Zero input fields in node form — the sidebar shows as empty');
        }
        if (formAudit.inputCount > 0 && formAudit.labelCount === 0) {
          issue('major', 'Accessibility', 'Input fields exist but no <label> elements found — screen readers cannot identify what each field is for');
        }
        if (formAudit.tabCount === 0) {
          issue('minor', 'Sidebar', 'No wizard tabs detected — manhole details could benefit from info/details/notes tabs to reduce cognitive overload');
        }
        if (!formAudit.hasDeleteBtn) {
          issue('minor', 'Sidebar', 'No delete button in node details panel — user must use keyboard shortcut (Delete/Backspace) which is not discoverable');
        }
        if (!formAudit.hasValidation) {
          issue('minor', 'Data Entry', 'No inline validation indicators found — user gets no immediate feedback on invalid field values');
        }
        if (!formAudit.hasHelpText) {
          issue('minor', 'Data Entry', 'No help text or field descriptions — complex fields like "accuracy level" and "engineering status" have no explanation');
        }

        // Audit dropdowns
        for (const s of formAudit.selects) {
          if (s.options <= 1) {
            issue('minor', 'Data Entry', `Dropdown "${s.id}" has only ${s.options} option — useless dropdown`);
          }
          if (!s.hasPlaceholder && s.options > 2) {
            issue('cosmetic', 'Data Entry', `Dropdown "${s.id}" has no placeholder/prompt option — user doesn't know what to select`);
          }
        }

        // Try filling the ID input
        const idInput = page.locator('#detailsContainer #idInput').first();
        if (await idInput.isVisible({ timeout: 500 }).catch(() => false)) {
          await idInput.clear();
          await idInput.fill('MH-001');
          const val = await idInput.inputValue().catch(() => '');
          if (val !== 'MH-001') {
            issue('major', 'Data Entry', `ID input rejected value "MH-001" (got "${val}"). Field may be auto-incremented only — no manual ID entry allowed.`);
          }
        }

        // Try interacting with first visible select
        const firstSelect = page.locator('#detailsContainer select').first();
        if (await firstSelect.isVisible({ timeout: 500 }).catch(() => false)) {
          try { await firstSelect.selectOption({ index: 1 }); } catch { /* ok */ }
        }

        await shot(page, '05-node-form');
      }

      // Close sidebar
      await page.evaluate(() => {
        const btn = document.getElementById('sidebarCloseBtn') as HTMLElement;
        if (btn) btn.click();
      });
      await waitSidebar(page, false, 1000);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 5: Select Edge → Edit Data
    // ═══════════════════════════════════════════════════════════════════════
    await activateMode(page, 'edge');
    await page.waitForTimeout(100);

    // Click midpoint between node 0 and node 1
    const midX = (positions[0].x + positions[1].x) / 2;
    const midY = (positions[0].y + positions[1].y) / 2;
    await clickCanvas(page, midX, midY);
    const edgeSidebar = await waitSidebar(page, true, 1500);

    if (!edgeSidebar) {
      issue('major', 'Interaction', 'Could not select an edge by clicking its midpoint. Edge hit zone is too narrow — user must click within a few pixels of the line. On mobile this is especially frustrating.');
    } else {
      const edgeFormAudit = await page.evaluate(() => {
        const c = document.getElementById('detailsContainer');
        if (!c) return null;
        return {
          inputCount: c.querySelectorAll('input, select, textarea').length,
          hasEdgeType: !!c.querySelector('#edgeTypeSelect'),
          hasMaterial: !!c.querySelector('#edgeMaterialSelect'),
          hasDiameter: !!c.querySelector('#edgeDiameterSelect'),
          hasTail: !!c.querySelector('#tailInput'),
          hasHead: !!c.querySelector('#headInput'),
          hasFallDepth: !!c.querySelector('#fallDepthInput'),
          hasDelete: !!c.querySelector('#deleteEdgeBtn'),
        };
      });

      if (edgeFormAudit) {
        if (edgeFormAudit.inputCount === 0) {
          issue('critical', 'Sidebar', 'Edge form has zero input fields');
        }
        if (!edgeFormAudit.hasTail || !edgeFormAudit.hasHead) {
          issue('major', 'Sidebar', 'Tail/head measurement inputs missing from edge form — the most critical field data for surveyors');
        }

        // Try filling tail measurement
        const tailInput = page.locator('#detailsContainer #tailInput').first();
        if (await tailInput.isVisible({ timeout: 500 }).catch(() => false)) {
          await tailInput.clear();
          await tailInput.fill('1.85');
        }

        // Try filling head measurement
        const headInput = page.locator('#detailsContainer #headInput').first();
        if (await headInput.isVisible({ timeout: 500 }).catch(() => false)) {
          await headInput.clear();
          await headInput.fill('2.40');
        }

        // Set diameter
        const diam = page.locator('#detailsContainer #edgeDiameterSelect').first();
        if (await diam.isVisible({ timeout: 500 }).catch(() => false)) {
          try { await diam.selectOption({ index: 3 }); } catch { /* ok */ }
        }

        await shot(page, '06-edge-form');
      }

      await page.evaluate(() => (document.getElementById('sidebarCloseBtn') as HTMLElement)?.click());
      await waitSidebar(page, false, 1000);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 6: Special Node Types
    // ═══════════════════════════════════════════════════════════════════════

    // Home node
    await activateMode(page, 'home');
    let homeMode = await getCurrentMode(page);
    if (homeMode !== 'home') {
      // Flyout may need opening
      await page.evaluate(() => (document.getElementById('nodeTypeFlyoutBtn') as HTMLElement)?.click());
      await page.waitForTimeout(200);
      await activateMode(page, 'home');
      homeMode = await getCurrentMode(page);
      if (homeMode !== 'home') {
        issue('major', 'Discoverability', 'Cannot switch to Home node mode — the button is hidden behind a flyout AND the flyout toggle may not be obvious to users');
      } else {
        issue('minor', 'Discoverability', 'Home/Drainage/Issue node types hidden behind flyout — extra click barrier for common operations');
      }
    }

    if (homeMode === 'home') {
      await clickCanvas(page, 0, -150);
      const homeSidebar = await waitSidebar(page, true, 1500);
      if (!homeSidebar) {
        issue('major', 'Interaction', 'Home node placement did not auto-open sidebar for data entry — user must manually click the node again');
      } else {
        const noteInput = page.locator('#detailsContainer textarea').first();
        if (await noteInput.isVisible({ timeout: 500 }).catch(() => false)) {
          await noteInput.fill('Building #47 connection');
        }
        await page.evaluate(() => (document.getElementById('sidebarCloseBtn') as HTMLElement)?.click());
        await waitSidebar(page, false, 1000);
      }
    }

    // Drainage node
    await activateMode(page, 'drainage');
    await clickCanvas(page, 0, 150);
    await page.waitForTimeout(200);

    await shot(page, '07-special-nodes');

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 7: Undo/Redo & Keyboard
    // ═══════════════════════════════════════════════════════════════════════
    const preUndo = await getSketchState(page);

    await page.evaluate(() => (document.getElementById('undoBtn') as HTMLElement)?.click());
    await page.waitForTimeout(200);
    const postUndo = await getSketchState(page);
    if (postUndo.nodes >= preUndo.nodes && preUndo.nodes > 0) {
      issue('minor', 'Undo/Redo', 'Undo button did not reverse last action');
    }
    await page.evaluate(() => (document.getElementById('redoBtn') as HTMLElement)?.click());
    await page.waitForTimeout(200);

    // Keyboard shortcuts
    await page.keyboard.press('n');
    await page.waitForTimeout(100);
    const afterN = await getCurrentMode(page);
    if (afterN !== 'node') {
      issue('minor', 'Keyboard', `"N" shortcut did not activate node mode (got "${afterN}"). Keyboard shortcuts may require canvas focus.`);
    }

    await page.keyboard.press('e');
    await page.waitForTimeout(100);
    const afterE = await getCurrentMode(page);
    if (afterE !== 'edge') {
      issue('minor', 'Keyboard', `"E" shortcut did not activate edge mode (got "${afterE}").`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 8: Zoom Controls
    // ═══════════════════════════════════════════════════════════════════════
    await page.evaluate(() => {
      (document.getElementById('canvasZoomInBtn') as HTMLElement)?.click();
      (document.getElementById('canvasZoomInBtn') as HTMLElement)?.click();
    });
    await page.waitForTimeout(200);

    const hasZoomIndicator = await page.evaluate(() => /\d+%/.test(document.body.innerText));
    if (!hasZoomIndicator) {
      issue('minor', 'Feedback', 'No zoom level indicator visible — user cannot tell current zoom level. Compare: every map app shows zoom level.');
    }

    await page.evaluate(() => {
      (document.getElementById('canvasZoomOutBtn') as HTMLElement)?.click();
      (document.getElementById('canvasZoomOutBtn') as HTMLElement)?.click();
    });

    await shot(page, '08-final');

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 9: Persistence & Final Audit
    // ═══════════════════════════════════════════════════════════════════════
    const finalState = await getSketchState(page);

    if (finalState.nodes === 0) {
      issue('critical', 'Persistence', 'Zero nodes in localStorage — nothing was persisted');
    }
    if (finalState.edges === 0 && edgesCreated > 0) {
      issue('critical', 'Persistence', 'Edges created but not persisted to localStorage');
    }

    // General layout audit
    const layoutAudit = await page.evaluate(() => {
      const header = document.querySelector('header.app-header')?.getBoundingClientRect();
      const toolbar = document.querySelector('.canvas-toolbar')?.getBoundingClientRect();
      const sidebar = document.getElementById('sidebar')?.getBoundingClientRect();
      const results: string[] = [];

      if (header && toolbar && toolbar.top < header.bottom) {
        results.push('Canvas toolbar overlaps with header');
      }

      // Check if any buttons have no visible text AND no aria-label
      document.querySelectorAll('button').forEach(btn => {
        const text = btn.textContent?.trim() ?? '';
        const label = btn.getAttribute('aria-label') || btn.getAttribute('title') || '';
        // Buttons with only Material Icon text (like "add", "remove") and no label
        if (text.length <= 20 && !label && btn.offsetHeight > 0) {
          const isMaterialIcon = btn.querySelector('.material-icons');
          if (isMaterialIcon && !label) {
            results.push(`Button with icon "${text}" has no aria-label`);
          }
        }
      });

      return results;
    });

    for (const l of layoutAudit) {
      if (l.includes('aria-label')) {
        issue('minor', 'Accessibility', l);
      } else {
        issue('minor', 'Layout', l);
      }
    }

    // Console errors
    if (consoleErrors.length > 0) {
      issue('major', 'Stability', `${consoleErrors.length} console error(s): ${consoleErrors.slice(0, 5).join(' | ').substring(0, 300)}`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Additional structural audits (non-interaction-dependent)
    // ═══════════════════════════════════════════════════════════════════════

    // Audit: RTL support
    const rtlAudit = await page.evaluate(() => {
      const html = document.documentElement;
      const isRTL = html.dir === 'rtl';
      const marginLeftUsage = document.querySelectorAll('[style*="margin-left"]').length;
      const paddingLeftUsage = document.querySelectorAll('[style*="padding-left"]').length;
      return { isRTL, marginLeftUsage, paddingLeftUsage };
    });
    if (rtlAudit.isRTL && (rtlAudit.marginLeftUsage + rtlAudit.paddingLeftUsage) > 3) {
      issue('minor', 'RTL', `Found ${rtlAudit.marginLeftUsage + rtlAudit.paddingLeftUsage} elements with hardcoded margin-left/padding-left — should use margin-inline-start/padding-inline-start for RTL`);
    }

    // Audit: Touch target sizes
    const smallTouchTargets = await page.evaluate(() => {
      let count = 0;
      document.querySelectorAll('button, a, [role="button"], input, select').forEach(el => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)) {
          count++;
        }
      });
      return count;
    });
    if (smallTouchTargets > 5) {
      issue('major', 'Mobile/Touch', `${smallTouchTargets} interactive elements have touch targets smaller than 44x44px (WCAG minimum). On mobile, users will misclick constantly.`);
    }

    // Audit: Color contrast (basic check)
    const contrastIssues = await page.evaluate(() => {
      let issues = 0;
      document.querySelectorAll('button, label, p, span, h1, h2, h3').forEach(el => {
        const style = getComputedStyle(el as Element);
        const color = style.color;
        const bg = style.backgroundColor;
        // Very basic check: light gray text on white bg
        if (color === 'rgb(192, 192, 192)' || color === 'rgb(200, 200, 200)' || color === 'rgb(204, 204, 204)') {
          if (bg === 'rgb(255, 255, 255)' || bg === 'rgba(0, 0, 0, 0)') {
            issues++;
          }
        }
      });
      return issues;
    });
    if (contrastIssues > 0) {
      issue('minor', 'Accessibility', `${contrastIssues} elements may have insufficient color contrast (light gray on white)`);
    }

    // Audit: Form field autocomplete attributes
    const autocompleteAudit = await page.evaluate(() => {
      let missing = 0;
      document.querySelectorAll('input[type="text"], input[type="email"], input[type="number"]').forEach(input => {
        if (!(input as HTMLInputElement).autocomplete) missing++;
      });
      return missing;
    });
    if (autocompleteAudit > 3) {
      issue('cosmetic', 'Forms', `${autocompleteAudit} input fields missing autocomplete attribute — browsers may show unwanted autofill suggestions`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GENERATE REPORT
    // ═══════════════════════════════════════════════════════════════════════
    const report = generateReport(timings, issues, finalState, nodesCreatedByClicks, edgesCreated);
    console.log('\n' + report);

    const reportDir = path.resolve('test-results');
    if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(path.join(reportDir, 'ux-audit-report.md'), report);

    // Test passes — this is an audit, not a regression gate
    expect(true).toBe(true);
  });
});

// ── Report ──────────────────────────────────────────────────────────────────

function generateReport(timings: TimingEntry[], issues: UiIssue[], finalState: any, nodesFromClicks: number, edgesFromClicks: number): string {
  const crit = issues.filter(i => i.severity === 'critical');
  const maj = issues.filter(i => i.severity === 'major');
  const min = issues.filter(i => i.severity === 'minor');
  const cos = issues.filter(i => i.severity === 'cosmetic');
  const slow = timings.filter(t => t.status === 'slow');

  const grade = crit.length > 2 ? 'F' : crit.length > 0 ? 'D' : maj.length > 3 ? 'C' : maj.length > 0 ? 'B' : 'A';

  let r = `# UX Audit Report — Full Sketch Workflow
Generated: ${new Date().toISOString()}
Grade: **${grade}**

## Executive Summary

| Metric | Value |
|--------|-------|
| **Overall Grade** | **${grade}** |
| Total issues | **${issues.length}** |
| Critical | **${crit.length}** |
| Major | **${maj.length}** |
| Minor | **${min.length}** |
| Cosmetic | **${cos.length}** |
| Slow operations | **${slow.length}** |
| Nodes created by clicks | ${nodesFromClicks}/4 |
| Edges created by clicks | ${edgesFromClicks}/3 |
| Final persisted nodes | ${finalState?.nodes ?? 0} |
| Final persisted edges | ${finalState?.edges ?? 0} |
| Node types | ${finalState?.types?.join(', ') || 'none'} |

---

## Performance Timings

| Action | Duration | Status |
|--------|----------|--------|
`;
  for (const t of timings) r += `| ${t.action} | ${t.durationMs}ms | ${t.status === 'slow' ? 'SLOW' : 'OK'} |\n`;

  if (crit.length) {
    r += `\n---\n\n## CRITICAL Issues (${crit.length})\n\nThese **block core workflows** and must be fixed immediately.\n\n`;
    for (const i of crit) { r += `### [${i.category}] ${i.description}\n`; if (i.evidence) r += `> ${i.evidence}\n`; r += '\n'; }
  }
  if (maj.length) {
    r += `\n---\n\n## MAJOR Issues (${maj.length})\n\nSerious usability problems that cause **significant friction**.\n\n`;
    for (const i of maj) { r += `### [${i.category}] ${i.description}\n`; if (i.evidence) r += `> ${i.evidence}\n`; r += '\n'; }
  }
  if (min.length) {
    r += `\n---\n\n## Minor Issues (${min.length})\n\n`;
    for (const i of min) r += `- **[${i.category}]** ${i.description}\n`;
  }
  if (cos.length) {
    r += `\n## Cosmetic Issues (${cos.length})\n\n`;
    for (const i of cos) r += `- **[${i.category}]** ${i.description}\n`;
  }

  r += `\n---\n\n## Phases Tested\n\n`;
  r += `1. App Load & Canvas Init\n2. Node Placement (4 manholes)\n3. Edge Drawing (3 connections)\n`;
  r += `4. Node Data Entry (sidebar form)\n5. Edge Data Entry (sidebar form)\n6. Special Nodes (Home, Drainage)\n`;
  r += `7. Undo/Redo & Keyboard Shortcuts\n8. Zoom Controls\n9. Persistence Check\n10. Structural Audit (RTL, Touch, Accessibility)\n`;

  r += `\n---\n*Automated UX audit by Playwright E2E test*\n`;
  return r;
}
