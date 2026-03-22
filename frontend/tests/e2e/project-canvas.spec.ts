/**
 * E2E tests for the project canvas mode DOM structure.
 *
 * These tests verify that the project canvas elements exist in the DOM
 * and have the correct structure. Since init() does not fully complete
 * in Vite dev mode (due to the t() i18n race condition), tests focus
 * on DOM attachment and structure rather than JS-driven behavior.
 */
import { test, expect } from '@playwright/test';
import {
  mockAuthAdmin,
  mockProjectSketches,
  gotoAuthenticated,
  MOCK_SKETCHES,
} from './helpers';

test.use({ contextOptions: { reducedMotion: 'reduce' } });

test.describe('Project Canvas Structure', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthAdmin(page);
    await mockProjectSketches(page, 'proj-aaa', MOCK_SKETCHES);
    await mockProjectSketches(page, 'proj-bbb', []);
  });

  test('sketch side panel element exists in the DOM', async ({ page }) => {
    await gotoAuthenticated(page);

    const sidePanel = page.locator('#sketchSidePanel');
    await expect(sidePanel).toBeAttached();
  });

  test('sketch side panel toggle exists in the DOM', async ({ page }) => {
    await gotoAuthenticated(page);

    const toggle = page.locator('#sketchSidePanelToggle');
    await expect(toggle).toBeAttached();
  });

  test('back to projects button exists in the DOM', async ({ page }) => {
    await gotoAuthenticated(page);

    const backBtn = page.locator('#backToProjectsBtn');
    await expect(backBtn).toBeAttached();
  });

  test('back button has arrow icon', async ({ page }) => {
    await gotoAuthenticated(page);

    const iconText = await page.evaluate(() => {
      const btn = document.getElementById('backToProjectsBtn');
      return btn?.querySelector('.material-icons')?.textContent?.trim();
    });
    expect(iconText).toBe('arrow_back');
  });

  test('canvas container is present in the DOM', async ({ page }) => {
    await gotoAuthenticated(page);

    const container = page.locator('#canvasContainer');
    await expect(container).toBeVisible();
  });

  test('home panel element exists in the DOM', async ({ page }) => {
    await gotoAuthenticated(page);

    const homePanel = page.locator('#homePanel');
    await expect(homePanel).toBeAttached();
  });

  test('home panel has dialog role and title', async ({ page }) => {
    await gotoAuthenticated(page);

    const homePanel = page.locator('#homePanel');
    await expect(homePanel).toBeAttached();

    const role = await homePanel.getAttribute('role');
    expect(role).toBe('dialog');

    const ariaLabel = await homePanel.getAttribute('aria-labelledby');
    expect(ariaLabel).toBe('homeTitle');
  });

  test('sketch side panel starts hidden', async ({ page }) => {
    await gotoAuthenticated(page);

    const sidePanel = page.locator('#sketchSidePanel');
    await expect(sidePanel).toBeHidden();
  });

  test('side panel has correct CSS classes', async ({ page }) => {
    await gotoAuthenticated(page);

    const hasClass = await page.evaluate(() => {
      const panel = document.getElementById('sketchSidePanel');
      return panel?.classList.contains('sketch-side-panel') ?? false;
    });
    expect(hasClass).toBe(true);
  });

  test('graph canvas exists alongside side panel', async ({ page }) => {
    await gotoAuthenticated(page);

    const canvas = page.locator('#graphCanvas');
    await expect(canvas).toBeVisible();

    const sidePanel = page.locator('#sketchSidePanel');
    await expect(sidePanel).toBeAttached();
  });
});
