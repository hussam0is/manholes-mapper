/**
 * E2E tests for the coordinate-replacement business rule.
 *
 * Product rule under test:
 *   "When a user adds a new coordinate to a node via canvas drag/click,
 *    any existing schematic-only or RTK-Float measurement on that node
 *    must be REPLACED — only the new (manual) coordinate should remain
 *    as the authoritative position."
 *
 * Three starting states are exercised:
 *   1. Node has NO coordinates at all (fresh schematic placement).
 *   2. Node has a SCHEMATIC measurement only (schematicX/schematicY set,
 *      no surveyX/surveyY, no high-quality GNSS fix).
 *   3. Node has a FLOAT measurement (surveyX/surveyY with
 *      gnssFixQuality === 5 → RTK Float).
 *
 * For each starting state, a canvas drag is performed, and the resulting
 * node object is inspected to verify the rule.
 *
 * Key findings during authoring (these assertions intentionally reflect
 * the *desired* behavior, so a failure here surfaces a real logic gap):
 *   - pointer-handlers.js currently BLOCKS drag when gnssFixQuality is 4 or 5
 *     (surveyX/Y + RTK Fixed/Float), which means scenario 3 cannot overwrite
 *     the float measurement by drag today.
 *   - Even in the manual-drag code path, surveyX/surveyY and schematicX/
 *     schematicY are NOT cleared — stale measurement data lingers on the
 *     node object.
 *
 * Tests run on the desktop Chromium project only — Mobile Chrome handles
 * pointer events differently and we want deterministic mouse drags.
 */
import { test, expect, type Page } from '@playwright/test';
import { mockAuthUser, gotoCanvasReady, dismissHomePanel } from './helpers';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

// Run this suite on Desktop Chromium only — Mobile Chrome uses touch pointer
// events and a smaller viewport where the canvas math below differs.
// Invoke with: npx playwright test coordinate-replacement.spec.ts --project=chromium
test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium',
    'Coordinate replacement rule is tested on Desktop Chromium only.'
  );
});

// ── Shapes ─────────────────────────────────────────────────────────────────

type SeededNode = {
  id: string;
  x: number;
  y: number;
  type?: string;
  nodeType?: string;
  schematicX?: number;
  schematicY?: number;
  surveyX?: number;
  surveyY?: number;
  surveyZ?: number;
  gnssFixQuality?: number;
  hasCoordinates?: boolean;
  accuracyLevel?: number;
  manual_x?: number;
  manual_y?: number;
};

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Put the view in a deterministic state:
 *  - scale = 1
 *  - world (0, 0) maps to the exact canvas pixel center
 * This lets us compute screen coordinates for a world point analytically.
 */
async function resetViewToCanvasCenter(page: Page) {
  await page.evaluate(() => {
    const canvas = document.getElementById('graphCanvas') as HTMLCanvasElement | null;
    if (!canvas) throw new Error('graphCanvas element not found');
    const setView = (window as any).__setViewState;
    if (typeof setView !== 'function') {
      throw new Error('window.__setViewState is not exposed — app did not finish init()');
    }
    // viewTranslate values are in canvas (backing-store) pixels.
    setView(1, canvas.width / 2, canvas.height / 2);
    (window as any).__scheduleDraw?.();
  });
}

/**
 * Seed the active sketch with a single node. Calls __setActiveSketchData to
 * replace the whole sketch so state is deterministic per test.
 */
async function seedSingleNode(page: Page, node: SeededNode) {
  await page.evaluate((n) => {
    const fn = (window as any).__setActiveSketchData;
    if (typeof fn !== 'function') {
      throw new Error('window.__setActiveSketchData is not exposed');
    }
    fn({
      nodes: [n],
      edges: [],
      nextNodeId: 999,
      sketchId: 'coord-replacement-test',
      sketchName: 'coord-replacement-test',
    });
    (window as any).__scheduleDraw?.();
  }, node as any);
  // Give the draw loop a tick to settle and spatial grid to rebuild.
  await page.waitForTimeout(120);
}

/**
 * Read back the node with the given id from the active sketch.
 */
async function readNode(page: Page, id: string): Promise<any | null> {
  return page.evaluate((id) => {
    const data = (window as any).__getActiveSketchData?.();
    if (!data || !Array.isArray(data.nodes)) return null;
    const found = data.nodes.find((n: any) => String(n.id) === String(id));
    return found ? { ...found } : null;
  }, id);
}

/**
 * Convert a world coordinate to a CSS-pixel point relative to the viewport.
 * Uses the current viewScale / viewStretch / viewTranslate read from S inside
 * the page. We reach into S via the shared-state module export on window.S
 * if available, otherwise fall back to recomputing from __setViewState's
 * inverse (which we set deterministically in resetViewToCanvasCenter).
 */
async function worldToViewportPx(
  page: Page,
  world: { x: number; y: number }
): Promise<{ x: number; y: number }> {
  return page.evaluate(({ world }) => {
    const canvas = document.getElementById('graphCanvas') as HTMLCanvasElement | null;
    if (!canvas) throw new Error('graphCanvas element not found');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    // We deterministically set viewScale=1, viewTranslate=(cw/2, ch/2),
    // so screen-in-canvas-pixels = world * viewStretch + (cw/2, ch/2).
    // viewStretchX/Y default to 1 unless coordinate-mode is active; we
    // do not enter coordinate mode so stretch = (1, 1).
    const stretchX = 1;
    const stretchY = 1;
    const screenCanvasPx = {
      x: world.x * stretchX + canvas.width / 2,
      y: world.y * stretchY + canvas.height / 2,
    };
    // Convert backing-store px → CSS px → viewport px.
    return {
      x: rect.left + screenCanvasPx.x / dpr,
      y: rect.top + screenCanvasPx.y / dpr,
    };
  }, { world });
}

/**
 * Perform a drag on the canvas from a world-coord start to a world-coord end.
 * Uses multiple intermediate moves so the app's drag-threshold
 * (MOUSE_TAP_MOVE_THRESHOLD = 6 CSS px) is exceeded and pointerMove() runs
 * the drag branch rather than the "pending tap" branch.
 */
async function dragOnCanvas(
  page: Page,
  fromWorld: { x: number; y: number },
  toWorld: { x: number; y: number }
) {
  const start = await worldToViewportPx(page, fromWorld);
  const end = await worldToViewportPx(page, toWorld);

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  // Step through so incremental pointermove events fire and the drag threshold
  // is passed early (first step is > 6 px).
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await page.mouse.move(
      start.x + (end.x - start.x) * t,
      start.y + (end.y - start.y) * t,
      { steps: 2 }
    );
  }
  await page.mouse.up();
  // Let the pointerUp handler and saveToStorage flush.
  await page.waitForTimeout(200);
}

// ── Test suite ─────────────────────────────────────────────────────────────

test.describe('Coordinate replacement on canvas drag', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthUser(page);
    await gotoCanvasReady(page);
    await dismissHomePanel(page);
    await resetViewToCanvasCenter(page);
  });

  test('Scenario 1 — node with NO coordinates: drag assigns a new position', async ({ page }) => {
    await seedSingleNode(page, {
      id: 'n-nocoord',
      x: 0,
      y: 0,
      type: 'manhole',
      nodeType: 'Manhole',
      // No schematicX/Y, no surveyX/Y, no gnssFixQuality
    });

    const before = await readNode(page, 'n-nocoord');
    expect(before, 'seeded node must exist').not.toBeNull();
    expect(before.surveyX ?? null).toBeNull();
    expect(before.surveyY ?? null).toBeNull();
    expect(before.schematicX ?? null).toBeNull();
    expect(before.schematicY ?? null).toBeNull();

    // Drag 120 world-units right, 80 world-units down.
    await dragOnCanvas(page, { x: 0, y: 0 }, { x: 120, y: 80 });

    const after = await readNode(page, 'n-nocoord');
    expect(after, 'node must still exist after drag').not.toBeNull();

    // The node should have moved in world space (within a tolerance of
    // one NODE_RADIUS to allow for pointerdown offset & rounding).
    expect(Math.abs(after.x - 120), 'x moved to new world position').toBeLessThan(25);
    expect(Math.abs(after.y - 80), 'y moved to new world position').toBeLessThan(25);

    // Survey fields must still be absent — we only dragged, no GNSS capture.
    expect(after.surveyX ?? null).toBeNull();
    expect(after.surveyY ?? null).toBeNull();
  });

  test('Scenario 2 — node with SCHEMATIC measurement: drag REPLACES the schematic', async ({ page }) => {
    // Schematic-only node: schematicX/Y set, no survey fields, accuracyLevel=1
    // (marks the node as schematic-only in the completeness engine).
    await seedSingleNode(page, {
      id: 'n-schem',
      x: 0,
      y: 0,
      type: 'manhole',
      nodeType: 'Manhole',
      schematicX: 0,
      schematicY: 0,
      accuracyLevel: 1,
    });

    await dragOnCanvas(page, { x: 0, y: 0 }, { x: 120, y: 80 });

    const after = await readNode(page, 'n-schem');
    expect(after, 'node must exist after drag').not.toBeNull();

    // Primary invariant: after the drag, the node's canvas position (x/y)
    // reflects the new manual placement.
    expect(Math.abs(after.x - 120)).toBeLessThan(25);
    expect(Math.abs(after.y - 80)).toBeLessThan(25);

    // Per the product rule, the schematic measurement must be REPLACED —
    // it must NOT remain at the stale (0, 0) position. Acceptable
    // replacements are:
    //   (a) schematicX/Y updated to the new position, OR
    //   (b) schematicX/Y cleared (so the node is no longer "schematic-only"
    //       and the live x/y is the source of truth).
    //
    // Both of those pass the assertion below; only the current buggy
    // behavior (schematicX/Y frozen at the old value) fails it.
    const staleSchematic =
      after.schematicX === 0 && after.schematicY === 0;
    expect(
      staleSchematic,
      'schematic measurement must be replaced on drag, not left at the pre-drag value'
    ).toBe(false);
  });

  test('Scenario 3 — node with FLOAT measurement: drag REPLACES the RTK-Float survey', async ({ page }) => {
    // RTK Float node: surveyX/Y set, gnssFixQuality = 5.
    // Realistic ITM coordinates (easting 100k–300k, northing 400k–800k per
    // the tsc3-parser validator ranges) so any downstream checks don't
    // reject the seed.
    await seedSingleNode(page, {
      id: 'n-float',
      x: 0,
      y: 0,
      type: 'manhole',
      nodeType: 'Manhole',
      surveyX: 180000,
      surveyY: 660000,
      surveyZ: 50,
      gnssFixQuality: 5, // RTK Float
      hasCoordinates: true,
    });

    await dragOnCanvas(page, { x: 0, y: 0 }, { x: 120, y: 80 });

    const after = await readNode(page, 'n-float');
    expect(after, 'node must exist after drag').not.toBeNull();

    // The node should have been moved by the drag (the user intends to
    // override the float measurement with a manual placement).
    expect(
      Math.abs(after.x - 120),
      'drag must actually move the node — RTK-Float should not lock it out of manual adjustment'
    ).toBeLessThan(25);

    // The float measurement MUST be replaced. Acceptable outcomes:
    //   (a) surveyX/Y cleared (null/undefined), gnssFixQuality demoted
    //       (e.g. 6 = Manual, or cleared), OR
    //   (b) surveyX/Y replaced with new ITM values derived from the
    //       dragged canvas position (and gnssFixQuality likewise demoted).
    // The current buggy behavior preserves the original RTK-Float survey
    // coords unchanged, which fails this assertion.
    const staleFloat =
      after.surveyX === 180000 &&
      after.surveyY === 660000 &&
      after.gnssFixQuality === 5;
    expect(
      staleFloat,
      'RTK-Float measurement must be replaced on drag, not preserved at the pre-drag survey'
    ).toBe(false);
  });
});
