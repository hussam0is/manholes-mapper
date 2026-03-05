/**
 * E2E tests for the export flow.
 *
 * Verifies that the export-related DOM elements exist and are properly
 * structured. The export menu button, individual export items, and
 * save button are all checked.
 */
import { test, expect } from '@playwright/test';
import { mockAuthAdmin, gotoCanvasReady, gotoAuthenticated, dismissHomePanel } from './helpers';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

test.describe('Export Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockAuthAdmin(page);
    await gotoCanvasReady(page);
    await dismissHomePanel(page);
  });

  test('export menu button exists in the DOM', async ({ page }) => {
    const exportMenuBtn = page.locator('#exportMenuBtn');
    await expect(exportMenuBtn).toBeAttached();
  });

  test('export menu button has apps icon', async ({ page }) => {
    const iconText = await page.evaluate(() => {
      const btn = document.getElementById('exportMenuBtn');
      return btn?.querySelector('.material-icons')?.textContent?.trim();
    });
    expect(iconText).toBe('apps');
  });

  test('export dropdown exists in the DOM', async ({ page }) => {
    const dropdown = page.locator('#exportDropdown');
    await expect(dropdown).toBeAttached();
  });

  test('export nodes button exists in the dropdown', async ({ page }) => {
    const exportNodesBtn = page.locator('#exportNodesBtn');
    await expect(exportNodesBtn).toBeAttached();
  });

  test('export edges button exists in the dropdown', async ({ page }) => {
    const exportEdgesBtn = page.locator('#exportEdgesBtn');
    await expect(exportEdgesBtn).toBeAttached();
  });

  test('export sketch button exists in the dropdown', async ({ page }) => {
    const exportSketchBtn = page.locator('#exportSketchBtn');
    await expect(exportSketchBtn).toBeAttached();
  });

  test('export buttons are inside the controls nav', async ({ page }) => {
    const nodesInControls = await page.evaluate(() => {
      const btn = document.getElementById('exportNodesBtn');
      return btn?.closest('#controls, nav, .menu-dropdown') !== null;
    });
    expect(nodesInControls).toBe(true);
  });

  test('save button exists in the header', async ({ page }) => {
    const saveBtn = page.locator('#saveBtn');
    await expect(saveBtn).toBeAttached();
  });

  test('save button has save icon', async ({ page }) => {
    const iconText = await page.evaluate(() => {
      const btn = document.getElementById('saveBtn');
      return btn?.querySelector('.material-icons')?.textContent?.trim();
    });
    expect(iconText).toBe('save');
  });
});
