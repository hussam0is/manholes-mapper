/**
 * Shared test helpers for E2E tests.
 *
 * Provides mock data constants and reusable functions for setting up
 * authenticated sessions with route interception, so tests run without
 * a real backend.
 */
import { type Page } from '@playwright/test';

// ── Mock data ───────────────────────────────────────────────────────────────

export const MOCK_USER = {
  id: 'user-001',
  name: 'Test User',
  email: 'test@example.com',
};

export const MOCK_ADMIN_USER = {
  id: 'admin-001',
  name: 'Admin User',
  email: 'admin@geopoint.me',
};

export const MOCK_SESSION = {
  id: 'session-001',
  userId: MOCK_USER.id,
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
};

export const MOCK_ADMIN_SESSION = {
  id: 'session-002',
  userId: MOCK_ADMIN_USER.id,
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
};

export const MOCK_PROJECTS = [
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
];

export const MOCK_SKETCHES = [
  {
    id: 'sk-001',
    name: 'Main Street',
    nodes: [
      { id: '1', x: 100, y: 200, type: 'manhole' },
      { id: '2', x: 300, y: 400, type: 'manhole' },
      { id: '3', x: 500, y: 300, type: 'drainage' },
    ],
    edges: [
      { tail: '1', head: '2', length: 2.83 },
      { tail: '2', head: '3', length: 2.24 },
    ],
    adminConfig: {},
    snapshotInputFlowConfig: {},
  },
  {
    id: 'sk-002',
    name: 'Park Avenue',
    nodes: [{ id: '4', x: 150, y: 250, type: 'manhole' }],
    edges: [],
    adminConfig: {},
    snapshotInputFlowConfig: {},
  },
];

// ── Auth mocks ──────────────────────────────────────────────────────────────

/**
 * Set up route mocks for an authenticated regular user session.
 */
export async function mockAuthUser(page: Page) {
  await page.route('**/api/auth/get-session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ session: MOCK_SESSION, user: MOCK_USER }),
    })
  );
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
  await page.route('**/api/user-role**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ role: 'user', permissions: ['read', 'write'], features: {} }),
    })
  );
  await page.route('**/api/sketches**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    }
    return route.fallback();
  });
  await page.route('**/api/projects', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects: [] }),
      });
    }
    return route.fallback();
  });
}

/**
 * Set up route mocks for an authenticated admin session.
 * Includes admin permissions, project list, and user list.
 */
export async function mockAuthAdmin(page: Page) {
  await page.route('**/api/auth/get-session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ session: MOCK_ADMIN_SESSION, user: MOCK_ADMIN_USER }),
    })
  );
  await page.route('**/api/auth/**', (route) => {
    const url = route.request().url();
    if (url.includes('get-session')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ session: MOCK_ADMIN_SESSION, user: MOCK_ADMIN_USER }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });
  await page.route('**/api/user-role**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        role: 'super_admin',
        isAdmin: true,
        isSuperAdmin: true,
        permissions: ['read', 'write', 'admin'],
        features: {
          export_csv: true,
          export_sketch: true,
          admin_settings: true,
          finish_workday: true,
          node_types: true,
          edge_types: true,
        },
      }),
    })
  );
  await page.route('**/api/users**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'admin-001', name: 'Admin User', email: 'admin@geopoint.me', role: 'super_admin' },
          { id: 'user-001', name: 'Test User', email: 'test@example.com', role: 'user' },
        ]),
      });
    }
    return route.fallback();
  });
  await page.route('**/api/organizations**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'org-001', name: 'Geopoint Plus' },
        ]),
      });
    }
    return route.fallback();
  });
  await page.route('**/api/features/**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    }
    return route.fallback();
  });
  await page.route('**/api/sketches**', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    }
    return route.fallback();
  });
  await page.route('**/api/projects', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects: MOCK_PROJECTS }),
      });
    }
    return route.fallback();
  });
}

/**
 * Mock the /api/projects/:id endpoint with full sketches.
 */
export async function mockProjectSketches(
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

// ── Navigation helpers ──────────────────────────────────────────────────────

/**
 * Navigate to the app root and wait for auth loading to finish.
 */
export async function gotoAuthenticated(page: Page) {
  await page.goto('/');
  await page.locator('#authLoadingOverlay').waitFor({ state: 'hidden', timeout: 15000 });
}

/**
 * Navigate and wait for the canvas to be initialized (non-zero dimensions).
 * Also waits for init() to complete by checking that at least one mode
 * button has been set up (node mode button gets content from updateModeButtons).
 */
export async function gotoCanvasReady(page: Page) {
  await gotoAuthenticated(page);
  await page.waitForFunction(
    () => {
      const c = document.getElementById('graphCanvas') as HTMLCanvasElement | null;
      return c && c.width > 0 && c.height > 0;
    },
    { timeout: 15000 }
  );
  // Wait for lazy-loaded modules (cockpit, etc.) to initialize.
  // The cockpit module is loaded via dynamic import in main-entry.js
  // and injects a .cockpit element into the DOM when ready.
  await page.waitForFunction(
    () => document.querySelector('.cockpit') !== null,
    { timeout: 10000 }
  ).catch(() => {
    // Cockpit may not init in all viewport sizes — non-fatal
  });
  // Brief settle time for event handlers
  await page.waitForTimeout(300);
}

/**
 * Navigate and wait for the home panel to be visible.
 */
export async function gotoHome(page: Page) {
  await page.goto('/');
  await page.locator('#authLoadingOverlay').waitFor({ state: 'hidden', timeout: 15000 });
  await page.locator('#homePanel').waitFor({ state: 'visible', timeout: 10000 });
}

/**
 * Close the home panel if it is open, so the canvas is accessible.
 * Waits for a stable load state before touching the DOM to avoid
 * "execution context was destroyed" errors when a navigation
 * (e.g. auth redirect) is still settling.
 */
export async function dismissHomePanel(page: Page) {
  // Ensure the page has committed a document and isn't mid-navigation
  await page.waitForLoadState('domcontentloaded');

  // Use locator-based approach: more resilient than raw evaluate()
  // because Playwright auto-waits and retries against the live DOM.
  for (const id of ['homePanel', 'startPanel']) {
    const panel = page.locator(`#${id}`);
    if (await panel.count() > 0) {
      await panel.evaluate((el) => {
        el.classList.remove('panel-closing');
        (el as HTMLElement).style.display = 'none';
      });
    }
  }

  // Wait briefly for event loop to settle
  await page.waitForTimeout(300);
}
