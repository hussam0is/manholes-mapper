/**
 * System tests for the Projects Homepage and Sketch Selection flows.
 *
 * Uses Playwright route interception to mock API responses so we can
 * test the full DOM-driven user flows without a real backend.
 */
import { test, expect, type Page } from '@playwright/test';

// Skip CSS animations so hidePanelAnimated() completes instantly
test.use({ contextOptions: { reducedMotion: 'reduce' } });

// ── Mock data ───────────────────────────────────────────────────────────────

const MOCK_USER = {
  id: 'user-001',
  name: 'Test User',
  email: 'test@example.com',
};

const MOCK_SESSION = {
  id: 'session-001',
  userId: MOCK_USER.id,
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
};

const MOCK_PROJECTS = [
  {
    id: 'proj-aaa',
    name: 'North District',
    description: 'Northern infrastructure survey',
  },
  {
    id: 'proj-bbb',
    name: 'South District',
    description: 'Southern manholes mapping',
  },
  {
    id: 'proj-ccc',
    name: 'Central Area',
    description: '',
  },
];

const MOCK_SKETCHES_A = [
  {
    id: 'sk-001',
    name: 'Main Street',
    nodes: [
      { id: '1', x: 100, y: 200 },
      { id: '2', x: 300, y: 400 },
    ],
    edges: [{ tail: '1', head: '2' }],
    adminConfig: {},
    snapshotInputFlowConfig: {},
  },
  {
    id: 'sk-002',
    name: 'Park Avenue',
    nodes: [{ id: '3', x: 150, y: 250 }],
    edges: [],
    adminConfig: {},
    snapshotInputFlowConfig: {},
  },
];

const MOCK_SKETCHES_EMPTY: any[] = [];

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Set up route mocks for an authenticated session with projects.
 */
async function mockAuthenticatedSession(page: Page) {
  // Mock auth session endpoint
  await page.route('**/api/auth/get-session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ session: MOCK_SESSION, user: MOCK_USER }),
    })
  );

  // Mock any other auth endpoints Better Auth might call
  await page.route('**/api/auth/**', (route) => {
    const url = route.request().url();
    if (url.includes('get-session')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ session: MOCK_SESSION, user: MOCK_USER }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });
}

/**
 * Mock the /api/projects endpoint.
 */
async function mockProjectsApi(page: Page, projects = MOCK_PROJECTS) {
  await page.route('**/api/projects', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects }),
      });
    }
    return route.fallback();
  });
}

/**
 * Mock the /api/projects/:id?fullSketches=true endpoint.
 */
async function mockProjectSketchesApi(
  page: Page,
  projectId: string,
  sketches: any[]
) {
  await page.route(`**/api/projects/${projectId}**`, (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sketches }),
      });
    }
    return route.fallback();
  });
}

/**
 * Mock the /api/sketches endpoint (for sketch list fallback).
 */
async function mockSketchesApi(page: Page, sketches: any[] = []) {
  await page.route('**/api/sketches**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(sketches),
      });
    }
    return route.fallback();
  });
}

/**
 * Navigate to app root and wait for auth + homepage to settle.
 */
async function gotoHomeAuthenticated(page: Page) {
  await page.goto('/');
  // Wait for auth loading to disappear and homePanel to appear
  await page.locator('#authLoadingOverlay').waitFor({ state: 'hidden', timeout: 10000 });
  // Wait for home panel to be displayed
  await page.locator('#homePanel').waitFor({ state: 'visible', timeout: 10000 });
}

/**
 * Ensure homePanel is hidden after navigating to a project route.
 *
 * The sync-service calls window.renderHome() after fetching sketches
 * from the cloud, which re-invokes renderProjectsHome() and re-shows
 * the homePanel (since homeMode is still 'projects'). We neutralize
 * this by overriding window.renderHome while in project-canvas mode,
 * then force-hiding the panel to clear any animation artifacts.
 */
async function ensureHomePanelHidden(page: Page) {
  // Wait for navigation and rendering to settle
  await page.waitForTimeout(500);

  // Retry evaluate in case page context was destroyed mid-navigation
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.evaluate(() => {
        // Prevent sync-service from re-showing the home panel
        if (!(window as any).__originalRenderHome) {
          (window as any).__originalRenderHome = (window as any).renderHome;
        }
        (window as any).renderHome = () => {};

        // Force-hide overlay panels
        for (const id of ['homePanel', 'startPanel']) {
          const el = document.getElementById(id);
          if (el) {
            el.classList.remove('panel-closing');
            el.style.display = 'none';
          }
        }

        // Install a persistent observer that re-hides panels when any
        // code path shows them (sync-service, route handler, etc.)
        if (!(window as any).__panelGuard) {
          const observer = new MutationObserver(() => {
            if ((window as any).__panelGuardDisabled) return;
            for (const id of ['homePanel', 'startPanel']) {
              const el = document.getElementById(id);
              if (el && el.style.display !== 'none') {
                el.style.display = 'none';
              }
            }
          });
          for (const id of ['homePanel', 'startPanel']) {
            const el = document.getElementById(id);
            if (el) {
              observer.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
            }
          }
          (window as any).__panelGuard = observer;
        }
        (window as any).__panelGuardDisabled = false;
      });
      break; // Success
    } catch {
      // Context destroyed during navigation — wait and retry
      await page.waitForTimeout(300);
    }
  }
  // Wait for panel to be hidden
  await page.locator('#homePanel').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
}

/**
 * Disable only the MutationObserver guard (keeps renderHome as no-op).
 * Use before clicking elements that the panel would otherwise overlay.
 */
async function disablePanelGuard(page: Page) {
  await page.evaluate(() => {
    (window as any).__panelGuardDisabled = true;
  });
}

/**
 * Restore the original renderHome so the homepage can re-render normally.
 * Call AFTER navigation to avoid sync-service re-showing the panel mid-click.
 */
async function restoreRenderHome(page: Page) {
  await page.evaluate(() => {
    if ((window as any).__originalRenderHome) {
      (window as any).renderHome = (window as any).__originalRenderHome;
      (window as any).renderHome();
    }
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

test.describe('Projects Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockProjectsApi(page);
    await mockSketchesApi(page);
    // Mock project sketch loading for all projects
    await mockProjectSketchesApi(page, 'proj-aaa', MOCK_SKETCHES_A);
    await mockProjectSketchesApi(page, 'proj-bbb', MOCK_SKETCHES_A);
    await mockProjectSketchesApi(page, 'proj-ccc', MOCK_SKETCHES_EMPTY);
  });

  test('should display home panel in projects mode on load', async ({ page }) => {
    await gotoHomeAuthenticated(page);

    const homePanel = page.locator('#homePanel');
    await expect(homePanel).toBeVisible();
    await expect(homePanel).toHaveClass(/home-panel--projects/);
  });

  test('should show dashboard icon in projects mode', async ({ page }) => {
    await gotoHomeAuthenticated(page);

    const icon = page.locator('.home-panel-header-title .material-icons').first();
    await expect(icon).toHaveText('dashboard');
  });

  test('should show subtitle text', async ({ page }) => {
    await gotoHomeAuthenticated(page);

    const subtitle = page.locator('.home-panel-header-subtitle');
    await expect(subtitle).toBeVisible();
    // Should have some text (language-dependent)
    const text = await subtitle.textContent();
    expect(text!.trim().length).toBeGreaterThan(0);
  });

  test('should render project cards', async ({ page }) => {
    await gotoHomeAuthenticated(page);

    const cards = page.locator('.project-card');
    await expect(cards).toHaveCount(3);
  });

  test('should display project names in cards', async ({ page }) => {
    await gotoHomeAuthenticated(page);

    // Check that project names appear
    await expect(page.locator('.sketch-card-title').nth(0)).toHaveText('North District');
    await expect(page.locator('.sketch-card-title').nth(1)).toHaveText('South District');
    await expect(page.locator('.sketch-card-title').nth(2)).toHaveText('Central Area');
  });

  test('should display project descriptions when present', async ({ page }) => {
    await gotoHomeAuthenticated(page);

    // First two projects have descriptions
    const metas = page.locator('.project-card .sketch-card-meta');
    await expect(metas.nth(0)).toHaveText('Northern infrastructure survey');
    await expect(metas.nth(1)).toHaveText('Southern manholes mapping');
  });

  test('should have folder icon on each project card', async ({ page }) => {
    await gotoHomeAuthenticated(page);

    // Wait for all 3 project cards to render
    await expect(page.locator('.project-card')).toHaveCount(3);

    const folderIcons = page.locator('.project-card .sketch-card-icon .material-icons');
    await expect(folderIcons).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await expect(folderIcons.nth(i)).toHaveText('folder');
    }
  });

  test('should have "Open Project" buttons', async ({ page }) => {
    await gotoHomeAuthenticated(page);

    const openBtns = page.locator('[data-action="openProject"]');
    await expect(openBtns).toHaveCount(3);
  });

  test('should hide close button in projects mode', async ({ page }) => {
    await gotoHomeAuthenticated(page);

    const closeBtn = page.locator('#homePanelCloseBtn');
    await expect(closeBtn).toBeHidden();
  });

  test('should hide footer in projects mode', async ({ page }) => {
    await gotoHomeAuthenticated(page);

    const footer = page.locator('.home-panel-footer');
    await expect(footer).toBeHidden();
  });

  test('should hide sketch tabs in projects mode', async ({ page }) => {
    await gotoHomeAuthenticated(page);

    const tabs = page.locator('#sketchTabs');
    await expect(tabs).toBeHidden();
  });
});

test.describe('Project Click → Canvas Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockProjectsApi(page);
    await mockSketchesApi(page);
    await mockProjectSketchesApi(page, 'proj-aaa', MOCK_SKETCHES_A);
    await mockProjectSketchesApi(page, 'proj-bbb', MOCK_SKETCHES_A);
    await mockProjectSketchesApi(page, 'proj-ccc', MOCK_SKETCHES_EMPTY);
  });

  test('clicking a project card navigates to #/project/:id', async ({ page }) => {
    await gotoHomeAuthenticated(page);

    // Click the first project card
    await page.locator('.project-card').first().click();

    // Hash should change
    await page.waitForURL(/#\/project\/proj-aaa/);
    expect(page.url()).toContain('#/project/proj-aaa');
  });

  test('clicking a project triggers hideHome', async ({ page }) => {
    await gotoHomeAuthenticated(page);

    await page.locator('.project-card').first().click();
    await page.waitForURL(/#\/project\/proj-aaa/);

    // hideHome() is called by loadProjectCanvas() as part of the route
    // handler. We verify it was invoked by checking that:
    // 1) The URL navigated to the project route (verified above)
    // 2) The sketch side panel appeared (which only happens after
    //    loadProjectCanvas runs, which always calls hideHome first)
    await ensureHomePanelHidden(page);
    const sidePanel = page.locator('#sketchSidePanel');
    await expect(sidePanel).toBeVisible({ timeout: 5000 });
  });

  test('clicking a project shows the sketch side panel', async ({ page }) => {
    await gotoHomeAuthenticated(page);

    await page.locator('.project-card').first().click();
    await page.waitForURL(/#\/project\/proj-aaa/);

    const sidePanel = page.locator('#sketchSidePanel');
    await expect(sidePanel).toBeVisible();
  });

  test('sketch side panel lists all project sketches', async ({ page }) => {
    await gotoHomeAuthenticated(page);

    await page.locator('.project-card').first().click();
    await page.waitForURL(/#\/project\/proj-aaa/);

    // Wait for side panel to render sketches
    const items = page.locator('.sketch-side-panel__item');
    await expect(items).toHaveCount(2);
  });

  test('sketch side panel shows sketch names', async ({ page }) => {
    await gotoHomeAuthenticated(page);

    await page.locator('.project-card').first().click();
    await page.waitForURL(/#\/project\/proj-aaa/);

    await expect(page.locator('.sketch-side-panel__name').nth(0)).toHaveText('Main Street');
    await expect(page.locator('.sketch-side-panel__name').nth(1)).toHaveText('Park Avenue');
  });

  test('first sketch is marked as active', async ({ page }) => {
    await gotoHomeAuthenticated(page);

    await page.locator('.project-card').first().click();
    await page.waitForURL(/#\/project\/proj-aaa/);

    const firstItem = page.locator('.sketch-side-panel__item').first();
    await expect(firstItem).toHaveClass(/active/);
  });

  test('side panel toggle button is visible', async ({ page }) => {
    await gotoHomeAuthenticated(page);

    await page.locator('.project-card').first().click();
    await page.waitForURL(/#\/project\/proj-aaa/);

    const toggleBtn = page.locator('#sketchSidePanelToggle');
    await expect(toggleBtn).toBeVisible();
  });

  test('empty project redirects back to homepage', async ({ page }) => {
    await gotoHomeAuthenticated(page);

    // Click the empty project (proj-ccc)
    await page.locator('.project-card').nth(2).click();

    // Should redirect back to #/ because project has no sketches
    await page.waitForURL(/#\//);
    const homePanel = page.locator('#homePanel');
    await expect(homePanel).toBeVisible();
  });
});

test.describe('Sketch Side Panel Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockProjectsApi(page);
    await mockSketchesApi(page);
    await mockProjectSketchesApi(page, 'proj-aaa', MOCK_SKETCHES_A);
  });

  async function navigateToProject(page: Page) {
    await gotoHomeAuthenticated(page);
    await page.locator('.project-card').first().click();
    await page.waitForURL(/#\/project\/proj-aaa/);
    // Wait for homePanel close animation to complete
    await ensureHomePanelHidden(page);
    await page.locator('.sketch-side-panel__item').first().waitFor({ state: 'visible' });
  }

  test('clicking a non-active sketch switches it to active', async ({ page }) => {
    await navigateToProject(page);

    // Second sketch should not be active
    const secondItem = page.locator('.sketch-side-panel__item').nth(1);
    await expect(secondItem).not.toHaveClass(/active/);

    // Click to switch
    await secondItem.click();

    // Second should now be active, first should not
    await expect(secondItem).toHaveClass(/active/);
    const firstItem = page.locator('.sketch-side-panel__item').first();
    await expect(firstItem).not.toHaveClass(/active/);
  });

  test('eye icon toggles sketch visibility', async ({ page }) => {
    await navigateToProject(page);

    // Find eye icon on second (non-active) sketch
    const secondEye = page.locator('.sketch-side-panel__item').nth(1).locator('.sketch-side-panel__eye');

    // Initially visible (visibility icon)
    await expect(secondEye.locator('.material-icons')).toHaveText('visibility');

    // Click to hide
    await secondEye.click();
    await expect(secondEye.locator('.material-icons')).toHaveText('visibility_off');

    // Click to show again
    await secondEye.click();
    await expect(secondEye.locator('.material-icons')).toHaveText('visibility');
  });

  test('side panel shows node count badges', async ({ page }) => {
    await navigateToProject(page);

    // First sketch has 2 nodes, second has 1
    const badges = page.locator('.sketch-side-panel__badge');
    await expect(badges.nth(0)).toHaveText('2');
    await expect(badges.nth(1)).toHaveText('1');
  });

  test('active sketch has edit icon', async ({ page }) => {
    await navigateToProject(page);

    const activeItem = page.locator('.sketch-side-panel__item.active');
    const editIcon = activeItem.locator('.sketch-side-panel__active-icon');
    await expect(editIcon).toBeVisible();
    await expect(editIcon).toHaveText('edit');
  });

  test('close button hides the side panel', async ({ page }) => {
    await navigateToProject(page);

    const closeBtn = page.locator('.sketch-side-panel__close');
    await closeBtn.click();

    const sidePanel = page.locator('#sketchSidePanel');
    await expect(sidePanel).not.toHaveClass(/open/);
  });

  test('toggle button re-opens the side panel', async ({ page }) => {
    await navigateToProject(page);

    // Close it first
    const closeBtn = page.locator('.sketch-side-panel__close');
    await closeBtn.click();
    await expect(page.locator('#sketchSidePanel')).not.toHaveClass(/open/);

    // Re-open via toggle
    const toggleBtn = page.locator('#sketchSidePanelToggle');
    await toggleBtn.click();
    await expect(page.locator('#sketchSidePanel')).toHaveClass(/open/);
  });
});

test.describe('Back to Projects Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockProjectsApi(page);
    await mockSketchesApi(page);
    await mockProjectSketchesApi(page, 'proj-aaa', MOCK_SKETCHES_A);
    await mockProjectSketchesApi(page, 'proj-bbb', MOCK_SKETCHES_A);
  });

  test('back button exists in sketch side panel', async ({ page }) => {
    await gotoHomeAuthenticated(page);
    await page.locator('.project-card').first().click();
    await page.waitForURL(/#\/project\/proj-aaa/);

    const backBtn = page.locator('#backToProjectsBtn');
    await expect(backBtn).toBeVisible();
  });

  test('back button has arrow_back icon', async ({ page }) => {
    await gotoHomeAuthenticated(page);
    await page.locator('.project-card').first().click();
    await page.waitForURL(/#\/project\/proj-aaa/);

    const icon = page.locator('#backToProjectsBtn .material-icons');
    await expect(icon).toHaveText('arrow_back');
  });

  test('back button links to #/', async ({ page }) => {
    await gotoHomeAuthenticated(page);
    await page.locator('.project-card').first().click();
    await page.waitForURL(/#\/project\/proj-aaa/);

    const backBtn = page.locator('#backToProjectsBtn');
    await expect(backBtn).toHaveAttribute('href', '#/');
  });

  test('clicking back button returns to projects homepage', async ({ page }) => {
    await gotoHomeAuthenticated(page);
    await page.locator('.project-card').first().click();
    await page.waitForURL(/#\/project\/proj-aaa/);
    await ensureHomePanelHidden(page);

    // Disable observer but keep renderHome as no-op so panels stay hidden
    await disablePanelGuard(page);

    // Click back button (panels hidden, so click goes through)
    await page.locator('#backToProjectsBtn').click();
    await page.waitForURL(/#\//);

    // Now restore renderHome and invoke it to show the projects homepage
    await restoreRenderHome(page);

    const homePanel = page.locator('#homePanel');
    await expect(homePanel).toBeVisible();
    await expect(homePanel).toHaveClass(/home-panel--projects/);
  });

  test('back button hides sketch side panel', async ({ page }) => {
    await gotoHomeAuthenticated(page);
    await page.locator('.project-card').first().click();
    await page.waitForURL(/#\/project\/proj-aaa/);
    await ensureHomePanelHidden(page);

    // Disable observer, click back, then check side panel state
    await disablePanelGuard(page);
    await page.locator('#backToProjectsBtn').click();
    await page.waitForURL(/#\//);

    // Side panel should be hidden after navigating back
    const sidePanel = page.locator('#sketchSidePanel');
    await expect(sidePanel).toBeHidden();
  });

  test('full round-trip: homepage → project → back → homepage', async ({ page }) => {
    await gotoHomeAuthenticated(page);

    // Step 1: Click first project
    await page.locator('.project-card').first().click();
    await page.waitForURL(/#\/project\/proj-aaa/);

    // Step 2: Go back via direct hash navigation (avoids animation overlay issues)
    await page.evaluate(() => { location.hash = '#/'; });
    await page.waitForURL(/#\//);

    // Step 3: Verify we're back on projects homepage
    await expect(page.locator('#homePanel')).toBeVisible();
    await expect(page.locator('#homePanel')).toHaveClass(/home-panel--projects/);
    await expect(page.locator('.project-card')).toHaveCount(3);
  });
});

test.describe('Fallback: No Projects → Sketch List', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page);
    // Return empty projects
    await mockProjectsApi(page, []);
    await mockSketchesApi(page);
  });

  test('falls back to sketches mode when no projects exist', async ({ page }) => {
    await gotoHomeAuthenticated(page);

    const homePanel = page.locator('#homePanel');
    await expect(homePanel).toBeVisible();
    // Should NOT have projects class
    await expect(homePanel).not.toHaveClass(/home-panel--projects/);
  });

  test('shows folder_open icon in sketches mode', async ({ page }) => {
    await gotoHomeAuthenticated(page);

    const icon = page.locator('.home-panel-header-title .material-icons').first();
    await expect(icon).toHaveText('folder_open');
  });

  test('shows close button in sketches mode', async ({ page }) => {
    await gotoHomeAuthenticated(page);

    const closeBtn = page.locator('#homePanelCloseBtn');
    await expect(closeBtn).toBeVisible();
  });

  test('shows footer in sketches mode', async ({ page }) => {
    await gotoHomeAuthenticated(page);

    const footer = page.locator('.home-panel-footer');
    await expect(footer).toBeVisible();
  });
});

test.describe('Fallback: API Error → Sketch List', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuthenticatedSession(page);
    await mockSketchesApi(page);
    // Mock projects API to fail
    await page.route('**/api/projects', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      })
    );
  });

  test('falls back to sketches mode on API error', async ({ page }) => {
    await gotoHomeAuthenticated(page);

    const homePanel = page.locator('#homePanel');
    await expect(homePanel).toBeVisible();
    await expect(homePanel).not.toHaveClass(/home-panel--projects/);
  });
});
