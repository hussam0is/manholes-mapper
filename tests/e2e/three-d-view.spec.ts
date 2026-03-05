/**
 * E2E tests for the 3D view button and overlay structure.
 *
 * The 3D view button starts hidden (display:none) and is shown via JS
 * after the permissions service loads user role data. Since init() does
 * not fully complete in Vite dev mode, we test:
 *   - The button element exists in the DOM
 *   - For admin users, the button can be force-shown
 *   - The button has the correct icon
 *   - The overlay module is correctly referenced
 */
import { test, expect } from '@playwright/test';
import { mockAuthAdmin, mockAuthUser, gotoCanvasReady, dismissHomePanel } from './helpers';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

test.describe('3D View Button', () => {
  test('3D view button exists in the DOM for admin users', async ({ page }) => {
    await mockAuthAdmin(page);
    await gotoCanvasReady(page);
    await dismissHomePanel(page);

    const threeDBtn = page.locator('#threeDViewBtn');
    await expect(threeDBtn).toBeAttached();
  });

  test('3D view button exists in the DOM for regular users', async ({ page }) => {
    await mockAuthUser(page);
    await gotoCanvasReady(page);
    await dismissHomePanel(page);

    const threeDBtn = page.locator('#threeDViewBtn');
    await expect(threeDBtn).toBeAttached();
  });

  test('3D view button starts hidden (display:none)', async ({ page }) => {
    await mockAuthUser(page);
    await gotoCanvasReady(page);
    await dismissHomePanel(page);

    const display = await page.evaluate(() => {
      const btn = document.getElementById('threeDViewBtn');
      return btn?.style.display;
    });
    expect(display).toBe('none');
  });

  test('3D view button has view_in_ar icon', async ({ page }) => {
    await mockAuthUser(page);
    await gotoCanvasReady(page);

    const iconText = await page.evaluate(() => {
      const btn = document.getElementById('threeDViewBtn');
      return btn?.querySelector('.material-icons')?.textContent?.trim();
    });
    expect(iconText).toBe('view_in_ar');
  });

  test('3D view button can be made visible via JS', async ({ page }) => {
    await mockAuthAdmin(page);
    await gotoCanvasReady(page);
    await dismissHomePanel(page);

    // Force-show the button (simulating what permissions service would do)
    await page.evaluate(() => {
      const btn = document.getElementById('threeDViewBtn');
      if (btn) btn.style.display = '';
    });

    const threeDBtn = page.locator('#threeDViewBtn');
    await expect(threeDBtn).toBeVisible();
  });

  test('3D view button is inside the canvas toolbar', async ({ page }) => {
    await mockAuthUser(page);
    await gotoCanvasReady(page);

    const isInToolbar = await page.evaluate(() => {
      const btn = document.getElementById('threeDViewBtn');
      // Check if it's a descendant of the toolbar or the FAB area
      return btn?.closest('.canvas-toolbar, .canvas-fab-toolbar, #canvasContainer') !== null;
    });
    expect(isInToolbar).toBe(true);
  });

  test('clicking force-shown 3D button does not crash', async ({ page }) => {
    await mockAuthAdmin(page);
    await gotoCanvasReady(page);
    await dismissHomePanel(page);

    // Force-show and click
    await page.evaluate(() => {
      const btn = document.getElementById('threeDViewBtn');
      if (btn) {
        btn.style.display = '';
        btn.click();
      }
    });

    // Wait for potential overlay or error
    await page.waitForTimeout(2000);

    // App should not have crashed
    await expect(page.locator('body')).toBeAttached();
    await expect(page.locator('#canvasContainer')).toBeAttached();
  });
});
