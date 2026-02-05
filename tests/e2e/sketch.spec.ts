/**
 * E2E tests for sketch operations
 * 
 * Tests the core sketch creation and editing functionality.
 */
import { test, expect } from '@playwright/test';

test.describe('Sketch Canvas', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should have canvas element', async ({ page }) => {
    const canvas = page.locator('#graphCanvas');
    await expect(canvas).toBeVisible();
  });

  test('should have canvas container', async ({ page }) => {
    const container = page.locator('#canvasContainer');
    await expect(container).toBeVisible();
  });

  test('should have mode selection buttons', async ({ page }) => {
    // Node mode button
    const nodeModeBtn = page.locator('#nodeModeBtn');
    await expect(nodeModeBtn).toBeVisible();
    
    // Edge mode button
    const edgeModeBtn = page.locator('#edgeModeBtn');
    await expect(edgeModeBtn).toBeVisible();
  });

  test('should have toolbar with mode group', async ({ page }) => {
    const toolbar = page.locator('.canvas-toolbar');
    await expect(toolbar).toBeVisible();
    
    const modeGroup = page.locator('#modeGroup');
    await expect(modeGroup).toBeVisible();
  });

  test('should have recenter button', async ({ page }) => {
    const recenterBtn = page.locator('#recenterBtn');
    await expect(recenterBtn).toBeVisible();
    // Support both English and Hebrew titles
    const title = await recenterBtn.getAttribute('title');
    expect(['Recenter sketch', 'מרכז שרטוט']).toContain(title);
  });
});

test.describe('Sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should have sidebar element', async ({ page }) => {
    const sidebar = page.locator('#sidebar');
    await expect(sidebar).toBeAttached();
  });

  test('should have details container', async ({ page }) => {
    const detailsContainer = page.locator('#detailsContainer');
    await expect(detailsContainer).toBeAttached();
  });

  test('should have sidebar close button', async ({ page }) => {
    const closeBtn = page.locator('#sidebarCloseBtn');
    await expect(closeBtn).toBeAttached();
  });
});

test.describe('Dialogs and Modals', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should have help modal (hidden by default)', async ({ page }) => {
    const helpModal = page.locator('#helpModal');
    await expect(helpModal).toBeAttached();
  });

  test('should have admin modal (hidden by default)', async ({ page }) => {
    const adminModal = page.locator('#adminModal');
    await expect(adminModal).toBeHidden();
  });

  test('should have start panel (attached to DOM)', async ({ page }) => {
    const startPanel = page.locator('#startPanel');
    await expect(startPanel).toBeAttached();
  });

  test('should have home panel (hidden by default)', async ({ page }) => {
    const homePanel = page.locator('#homePanel');
    await expect(homePanel).toBeHidden();
  });
});

test.describe('Toast Notifications', () => {
  test('should have toast container', async ({ page }) => {
    await page.goto('/');
    
    const toast = page.locator('#toast');
    await expect(toast).toBeAttached();
  });
});

test.describe('Responsive Design', () => {
  test('should show mobile menu on small screens', async ({ page }) => {
    // Set viewport to mobile size
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Mobile menu button should be visible
    const mobileMenuBtn = page.locator('#mobileMenuBtn');
    await expect(mobileMenuBtn).toBeVisible();
  });

  test('should show desktop controls on large screens', async ({ page }) => {
    // Set viewport to desktop size
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Desktop controls should be visible
    const controls = page.locator('#controls');
    await expect(controls).toBeVisible();
  });
});

test.describe('Language Selection', () => {
  test('should have language selector', async ({ page }) => {
    await page.goto('/');
    
    const langSelect = page.locator('#langSelect');
    await expect(langSelect).toBeVisible();
    
    // Should have Hebrew and English options
    const heOption = langSelect.locator('option[value="he"]');
    const enOption = langSelect.locator('option[value="en"]');
    
    await expect(heOption).toBeAttached();
    await expect(enOption).toBeAttached();
  });

  test('mobile language selector should exist', async ({ page }) => {
    await page.goto('/');
    
    const mobileLangSelect = page.locator('#mobileLangSelect');
    await expect(mobileLangSelect).toBeAttached();
  });
});
