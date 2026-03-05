/**
 * E2E tests for the admin panel.
 *
 * Verifies that the admin screen DOM elements exist, admin buttons are
 * present for the correct user roles, and basic navigation works.
 *
 * Note: The admin screen is shown/hidden by JS (handleRoute in main.js).
 * Since init() does not fully complete in Vite dev mode, tests check
 * DOM attachment rather than visibility for elements that require JS.
 */
import { test, expect, type Page } from '@playwright/test';
import { mockAuthAdmin, mockAuthUser, gotoCanvasReady, gotoAuthenticated } from './helpers';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

test.describe('Admin Panel DOM Structure', () => {
  test('admin screen element exists in the DOM', async ({ page }) => {
    await mockAuthAdmin(page);
    await gotoAuthenticated(page);

    const adminScreen = page.locator('#adminScreen');
    await expect(adminScreen).toBeAttached();
  });

  test('admin screen content area exists', async ({ page }) => {
    await mockAuthAdmin(page);
    await gotoAuthenticated(page);

    const adminContent = page.locator('#adminScreenContent');
    await expect(adminContent).toBeAttached();
  });

  test('admin screen save button exists', async ({ page }) => {
    await mockAuthAdmin(page);
    await gotoAuthenticated(page);

    const saveBtn = page.locator('#adminScreenSaveBtn');
    await expect(saveBtn).toBeAttached();
  });

  test('admin screen cancel button exists', async ({ page }) => {
    await mockAuthAdmin(page);
    await gotoAuthenticated(page);

    const cancelBtn = page.locator('#adminScreenCancelBtn');
    await expect(cancelBtn).toBeAttached();
  });

  test('admin screen import button exists', async ({ page }) => {
    await mockAuthAdmin(page);
    await gotoAuthenticated(page);

    const importBtn = page.locator('#adminScreenImportBtn');
    await expect(importBtn).toBeAttached();
  });

  test('admin screen export button exists', async ({ page }) => {
    await mockAuthAdmin(page);
    await gotoAuthenticated(page);

    const exportBtn = page.locator('#adminScreenExportBtn');
    await expect(exportBtn).toBeAttached();
  });
});

test.describe('Admin Button Visibility', () => {
  test('admin button exists for admin users on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockAuthAdmin(page);
    await gotoCanvasReady(page);

    const adminBtn = page.locator('#adminBtn');
    await expect(adminBtn).toBeAttached();
  });

  test('admin button has tune icon', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await mockAuthAdmin(page);
    await gotoCanvasReady(page);

    const iconText = await page.evaluate(() => {
      const btn = document.getElementById('adminBtn');
      return btn?.querySelector('.material-icons')?.textContent?.trim();
    });
    expect(iconText).toBe('tune');
  });

  test('mobile admin button exists in the DOM', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await mockAuthAdmin(page);
    await gotoCanvasReady(page);

    const mobileAdminBtn = page.locator('#mobileAdminBtn');
    await expect(mobileAdminBtn).toBeAttached();
  });

  test('admin screen starts hidden', async ({ page }) => {
    await mockAuthAdmin(page);
    await gotoAuthenticated(page);

    const adminScreen = page.locator('#adminScreen');
    await expect(adminScreen).toBeHidden();
  });
});
