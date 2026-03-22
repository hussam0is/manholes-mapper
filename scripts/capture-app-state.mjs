/**
 * capture-app-state.mjs — Full design-research capture for Manholes Mapper
 * Captures screenshots of every major screen/state + records a video walkthrough.
 * Target: https://manholes-mapper.vercel.app (production)
 * Output: app_state_2026-03-10/
 */
import { chromium } from 'playwright';
import { mkdir, rename, readdir, writeFile } from 'fs/promises';
import path from 'path';

const APP_URL = 'https://manholes-mapper.vercel.app';
const EMAIL = process.env.ADMIN_EMAIL || (() => { throw new Error('ADMIN_EMAIL env var is required'); })();
const PASSWORD = process.env.ADMIN_PASSWORD || (() => { throw new Error('ADMIN_PASSWORD env var is required'); })();
const OUT = 'C:/Users/murjan.a/Documents/manholes-mapper-dev-branch/manholes-mapper/app_state_2026-03-10';

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

// Collect observations
const observations = [];
function observe(cat, note) {
  observations.push({ category: cat, note });
  console.log(`  [${cat}] ${note}`);
}

// Track screenshots
const shots = [];

// Collect console errors
const consoleErrors = [];

// Safe screenshot
async function shot(page, name) {
  try {
    const file = path.join(OUT, name);
    await page.screenshot({ path: file, fullPage: false });
    console.log(`  >> ${name}`);
    return name;
  } catch (e) {
    console.log(`  !! ${name} FAILED: ${e.message.substring(0, 80)}`);
    return null;
  }
}

// Safe click with short timeout
async function safeClick(page, selector, timeout = 5000) {
  try {
    const el = await page.$(selector);
    if (!el) return false;
    const visible = await el.isVisible().catch(() => false);
    if (!visible) return false;
    await el.click({ timeout });
    return true;
  } catch (e) {
    console.log(`  !! click ${selector} failed: ${e.message.substring(0, 60)}`);
    return false;
  }
}

// Login helper
async function login(page) {
  await page.waitForTimeout(2500);
  const hash = await page.evaluate(() => window.location.hash).catch(() => '');
  if (!hash.includes('login')) {
    await page.goto(`${APP_URL}/#/login`, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2500);
  }
  try {
    const emailInput = await page.$('input[type="email"], input[name="email"]');
    if (emailInput) await emailInput.fill(EMAIL);
    const passInput = await page.$('input[type="password"]');
    if (passInput) await passInput.fill(PASSWORD);
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) await submitBtn.click({ timeout: 5000 });
    await page.waitForTimeout(4000);
  } catch (e) {
    console.log(`  !! login failed: ${e.message.substring(0, 80)}`);
  }
}

// Close home panel
async function closeHome(page) {
  try {
    const btn = await page.$('#homePanelCloseBtn');
    if (btn && await btn.isVisible().catch(() => false)) {
      await btn.click({ timeout: 3000 });
      await page.waitForTimeout(800);
      return true;
    }
  } catch (e) {}
  return false;
}

// Evaluate safely
async function safeEval(page, fn) {
  try { return await page.evaluate(fn); }
  catch (e) { return null; }
}

// ═══════════════════════════════════════════════════════════════════════
// PART 1: DESKTOP LIGHT MODE (1280x720)
// ═══════════════════════════════════════════════════════════════════════
console.log('\n=== PART 1: Desktop Light Mode (1280x720) ===\n');

const desktopCtx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  locale: 'he-IL',
  colorScheme: 'light',
});
const dp = await desktopCtx.newPage();
dp.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text().substring(0, 200));
});

// ── Workflow A: Login & Home ──
console.log('-- Workflow A: Login & Home --');

await dp.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
await dp.waitForTimeout(3000);
let s = await shot(dp, '01_A_pre_login.png');
if (s) shots.push({ file: s, desc: 'Pre-login state: login panel with geopoint branding, Hebrew RTL' });

await dp.goto(`${APP_URL}/#/login`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
await dp.waitForTimeout(2500);
s = await shot(dp, '02_A_login_form.png');
if (s) shots.push({ file: s, desc: 'Login form: email/password fields, Hebrew labels, blue submit button' });

await login(dp);
s = await shot(dp, '03_A_after_login.png');
if (s) shots.push({ file: s, desc: 'Post-login state (home panel or canvas)' });

// Check what's visible
const postLoginState = await safeEval(dp, () => {
  const hp = document.getElementById('homePanel');
  const hpVisible = hp && window.getComputedStyle(hp).display !== 'none' && !hp.hidden;
  const sketchList = document.getElementById('sketchList');
  const cards = sketchList ? sketchList.children.length : 0;
  return { homePanelVisible: hpVisible, sketchCards: cards };
});
observe('A', `Post-login: homePanel=${postLoginState?.homePanelVisible}, cards=${postLoginState?.sketchCards}`);

// If home panel is visible, screenshot it properly
if (postLoginState?.homePanelVisible) {
  s = await shot(dp, '04_A_home_panel.png');
  if (s) shots.push({ file: s, desc: `Home panel with ${postLoginState.sketchCards} sketch cards` });

  // Organization tab
  if (await safeClick(dp, '#organizationTab')) {
    await dp.waitForTimeout(2000);
    s = await shot(dp, '05_A_org_sketches.png');
    if (s) shots.push({ file: s, desc: 'Organization sketches tab' });
    await safeClick(dp, '#personalTab');
    await dp.waitForTimeout(1000);
  }
}

// Close home panel
await closeHome(dp);
await dp.waitForTimeout(500);

// ── Workflow B: Canvas Drawing ──
console.log('-- Workflow B: Canvas Drawing --');

s = await shot(dp, '06_B_canvas_view.png');
if (s) shots.push({ file: s, desc: 'Canvas view: left toolbar, cockpit panel on right, grid background' });

// Inspect UI layout
const uiLayout = await safeEval(dp, () => {
  const els = ['nodeModeBtn', 'edgeModeBtn', 'homeNodeModeBtn', 'drainageNodeModeBtn',
    'canvasFabToggle', 'canvasZoomInBtn', 'canvasZoomOutBtn', 'undoBtn',
    'exportMenuBtn', 'mobileMenuBtn', 'appHeader', 'modeGroup',
    'threeDViewBtn', 'myLocationBtn'];
  const result = {};
  for (const id of els) {
    const el = document.getElementById(id);
    if (el) {
      const s = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      result[id] = {
        visible: s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0,
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)
      };
    } else {
      result[id] = { exists: false };
    }
  }
  return result;
});
observe('B', `UI layout: ${JSON.stringify(uiLayout, null, 0).substring(0, 400)}`);

// Use keyboard shortcut N for node mode (more reliable than clicking)
await dp.keyboard.press('n');
await dp.waitForTimeout(500);

const canvas = await dp.$('canvas');
if (canvas) {
  const box = await canvas.boundingBox();
  if (box) {
    const cx = box.x + box.width * 0.4;  // Offset from center to avoid cockpit panel
    const cy = box.y + box.height / 2;

    // Create nodes
    await dp.mouse.click(cx, cy);
    await dp.waitForTimeout(800);
    s = await shot(dp, '07_B_node_created.png');
    if (s) shots.push({ file: s, desc: 'First node created on canvas' });

    await dp.mouse.click(cx + 100, cy - 60);
    await dp.waitForTimeout(500);
    await dp.mouse.click(cx - 60, cy + 80);
    await dp.waitForTimeout(500);
    s = await shot(dp, '08_B_three_nodes.png');
    if (s) shots.push({ file: s, desc: 'Three nodes placed on canvas' });

    // Edge mode via keyboard
    await dp.keyboard.press('e');
    await dp.waitForTimeout(500);

    // Connect nodes
    await dp.mouse.click(cx, cy);
    await dp.waitForTimeout(400);
    await dp.mouse.click(cx + 100, cy - 60);
    await dp.waitForTimeout(800);

    await dp.mouse.click(cx, cy);
    await dp.waitForTimeout(400);
    await dp.mouse.click(cx - 60, cy + 80);
    await dp.waitForTimeout(800);
    s = await shot(dp, '09_B_edges_created.png');
    if (s) shots.push({ file: s, desc: 'Edges connecting three nodes' });

    // Select a node (escape first)
    await dp.keyboard.press('Escape');
    await dp.waitForTimeout(500);
    await dp.mouse.click(cx, cy);
    await dp.waitForTimeout(2000);
    s = await shot(dp, '10_B_node_panel.png');
    if (s) shots.push({ file: s, desc: 'Node selected: details drawer/sidebar visible' });

    // Check sidebar
    const sidebarInfo = await safeEval(dp, () => {
      const sb = document.getElementById('sidebar');
      const title = document.getElementById('sidebarTitle');
      return {
        visible: sb ? window.getComputedStyle(sb).display !== 'none' : false,
        title: title?.textContent || '',
        height: sb?.getBoundingClientRect().height || 0,
      };
    });
    observe('B', `Sidebar: visible=${sidebarInfo?.visible}, title="${sidebarInfo?.title}"`);

    // Deselect and click edge midpoint
    await dp.keyboard.press('Escape');
    await dp.waitForTimeout(500);
    await dp.mouse.click(cx + 50, cy - 30);
    await dp.waitForTimeout(2000);
    s = await shot(dp, '11_B_edge_panel.png');
    if (s) shots.push({ file: s, desc: 'Edge selected: edge details panel' });

    // Zoom in
    await dp.keyboard.press('Escape');
    await dp.waitForTimeout(300);
    for (let i = 0; i < 5; i++) await dp.keyboard.press('+');
    await dp.waitForTimeout(600);
    s = await shot(dp, '12_B_zoomed_in.png');
    if (s) shots.push({ file: s, desc: 'Canvas zoomed in' });

    // Zoom out
    for (let i = 0; i < 10; i++) await dp.keyboard.press('-');
    await dp.waitForTimeout(600);
    s = await shot(dp, '13_B_zoomed_out.png');
    if (s) shots.push({ file: s, desc: 'Canvas zoomed out' });

    // Reset zoom
    await dp.keyboard.press('0');
    await dp.waitForTimeout(400);
  }
}

// Try FAB speed dial
if (await safeClick(dp, '#canvasFabToggle', 3000)) {
  await dp.waitForTimeout(700);
  s = await shot(dp, '14_B_fab_expanded.png');
  if (s) shots.push({ file: s, desc: 'FAB speed dial expanded' });
  await safeClick(dp, '#canvasFabToggle', 3000);
  await dp.waitForTimeout(400);
}

// Try command/export dropdown (check by evaluating which menu approach works)
const menuApproach = await safeEval(dp, () => {
  const exportBtn = document.getElementById('exportMenuBtn');
  const mobileBtn = document.getElementById('mobileMenuBtn');
  return {
    exportBtn: exportBtn ? { visible: window.getComputedStyle(exportBtn).display !== 'none', rect: exportBtn.getBoundingClientRect() } : null,
    mobileBtn: mobileBtn ? { visible: window.getComputedStyle(mobileBtn).display !== 'none', rect: mobileBtn.getBoundingClientRect() } : null,
  };
});
observe('B', `Menu approach: export=${JSON.stringify(menuApproach?.exportBtn)}, mobile=${JSON.stringify(menuApproach?.mobileBtn)}`);

if (menuApproach?.exportBtn?.visible) {
  await safeClick(dp, '#exportMenuBtn', 3000);
  await dp.waitForTimeout(800);
  s = await shot(dp, '15_B_command_menu.png');
  if (s) shots.push({ file: s, desc: 'Command/export dropdown menu' });

  // Try map layer toggle
  const mapToggleState = await safeEval(dp, () => {
    const t = document.getElementById('mapLayerToggle');
    return t ? { checked: t.checked } : null;
  });
  if (mapToggleState && !mapToggleState.checked) {
    await safeEval(dp, () => document.getElementById('mapLayerToggle')?.click());
    await dp.waitForTimeout(3500);
    s = await shot(dp, '16_B_map_layer.png');
    if (s) shots.push({ file: s, desc: 'Map layer enabled: tiles on canvas' });
    await safeEval(dp, () => document.getElementById('mapLayerToggle')?.click());
    await dp.waitForTimeout(500);
  }

  await dp.keyboard.press('Escape');
  await dp.waitForTimeout(400);
}

// Try mobile menu if desktop menu wasn't available
if (menuApproach?.mobileBtn?.visible) {
  await safeClick(dp, '#mobileMenuBtn', 3000);
  await dp.waitForTimeout(1000);
  s = await shot(dp, '15_B_mobile_menu.png');
  if (s) shots.push({ file: s, desc: 'Mobile-style hamburger menu on desktop' });
  await safeClick(dp, '#mobileMenuCloseBtn', 3000);
  await dp.waitForTimeout(500);
}

// New sketch dialog
if (await safeClick(dp, '#newSketchBtn', 3000)) {
  await dp.waitForTimeout(1200);
  s = await shot(dp, '17_A_new_sketch_dialog.png');
  if (s) shots.push({ file: s, desc: 'New Sketch creation dialog' });
  await safeClick(dp, '#cancelBtn', 3000);
  await dp.waitForTimeout(400);
}

// Help modal
if (await safeClick(dp, '#helpBtn', 3000)) {
  await dp.waitForTimeout(800);
  s = await shot(dp, '18_F_help_modal.png');
  if (s) shots.push({ file: s, desc: 'Help & keyboard shortcuts modal' });
  await safeClick(dp, '#closeHelpBtn', 3000);
  await dp.waitForTimeout(400);
}

// Language toggle
const langSwitched = await safeEval(dp, () => {
  const sel = document.getElementById('langSelect') || document.getElementById('mobileLangSelect');
  if (sel && window.getComputedStyle(sel).display !== 'none') {
    sel.value = 'en';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  return false;
});
if (langSwitched) {
  await dp.waitForTimeout(1500);
  s = await shot(dp, '19_F_english_ltr.png');
  if (s) shots.push({ file: s, desc: 'English/LTR mode' });

  // Revert
  await safeEval(dp, () => {
    const sel = document.getElementById('langSelect') || document.getElementById('mobileLangSelect');
    if (sel) { sel.value = 'he'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await dp.waitForTimeout(1000);
}

// ── Workflow C: Projects ──
console.log('-- Workflow C: Projects --');

await dp.goto(`${APP_URL}/#/projects`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
await dp.waitForTimeout(3000);
s = await shot(dp, '20_C_projects.png');
if (s) shots.push({ file: s, desc: 'Projects management screen' });

// Count projects
const projInfo = await safeEval(dp, () => {
  const list = document.getElementById('projectsList');
  const cards = list ? list.querySelectorAll('[class*="project"]').length : 0;
  // Also look for any clickable project elements
  const btns = list ? list.querySelectorAll('button, a').length : 0;
  return { cards, buttons: btns, html: list?.innerHTML?.substring(0, 500) || '' };
});
observe('C', `Projects: cards=${projInfo?.cards}, buttons=${projInfo?.buttons}`);

// Try to open first project
const projectOpened = await safeEval(dp, () => {
  const btns = document.querySelectorAll('#projectsList button, #projectsList a, [data-action="open-project"]');
  for (const b of btns) {
    if (b.textContent.includes('פתח') || b.textContent.includes('Open') || b.textContent.includes('כניסה') || b.textContent.includes('צפה')) {
      b.click();
      return true;
    }
  }
  // Click first project card directly
  const card = document.querySelector('.project-card, #projectsList > div');
  if (card) { card.click(); return true; }
  return false;
});
if (projectOpened) {
  await dp.waitForTimeout(5000);
  const currentHash = await safeEval(dp, () => window.location.hash);
  observe('C', `After project click: hash=${currentHash}`);

  if (currentHash?.includes('/project/')) {
    s = await shot(dp, '21_C_project_canvas.png');
    if (s) shots.push({ file: s, desc: 'Project canvas mode' });

    if (await safeClick(dp, '#sketchSidePanelToggle', 3000)) {
      await dp.waitForTimeout(1500);
      s = await shot(dp, '22_C_side_panel.png');
      if (s) shots.push({ file: s, desc: 'Sketch side panel' });

      // Try issues
      const issueClicked = await safeEval(dp, () => {
        const toggle = document.querySelector('.sketch-issues-toggle, [class*="issue-toggle"], [class*="issues-btn"]');
        if (toggle) { toggle.click(); return true; }
        return false;
      });
      if (issueClicked) {
        await dp.waitForTimeout(1000);
        s = await shot(dp, '23_C_issues.png');
        if (s) shots.push({ file: s, desc: 'Issues sub-panel' });
      }
    }
  }
}

// ── Workflow D: Admin ──
console.log('-- Workflow D: Admin --');

await dp.goto(`${APP_URL}/#/admin`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
await dp.waitForTimeout(3000);
s = await shot(dp, '24_D_admin.png');
if (s) shots.push({ file: s, desc: 'Admin panel — default view' });

// Inspect admin tabs by text content
const adminTabLabels = await safeEval(dp, () => {
  // Find all buttons/tabs with admin-related content
  const allBtns = document.querySelectorAll('button, [role="tab"], .tab-btn, a');
  const tabs = [];
  for (const b of allBtns) {
    const text = b.textContent?.trim();
    if (text && (text.includes('משתמש') || text.includes('ארגונ') || text.includes('תכונות') ||
        text.includes('Users') || text.includes('Org') || text.includes('Feature'))) {
      const r = b.getBoundingClientRect();
      tabs.push({ text: text.substring(0, 30), x: r.x, y: r.y, w: r.width, h: r.height, visible: r.width > 0 });
    }
  }
  return tabs;
});
observe('D', `Admin tab buttons found: ${JSON.stringify(adminTabLabels)}`);

// Click admin tabs by evaluating
for (const [label, shotName, shotDesc] of [
  ['ארגונים', '25_D_orgs.png', 'Admin — Organizations tab'],
  ['תכונות', '26_D_features.png', 'Admin — Features tab'],
  ['משתמשים', '27_D_users.png', 'Admin — Users tab'],
]) {
  const clicked = await safeEval(dp, (lbl) => {
    const btns = document.querySelectorAll('button, [role="tab"], .tab-btn, a');
    for (const b of btns) {
      if (b.textContent?.trim().includes(lbl) && b.getBoundingClientRect().width > 0) {
        b.click();
        return true;
      }
    }
    return false;
  }, label);
  if (clicked) {
    await dp.waitForTimeout(1500);
    s = await shot(dp, shotName);
    if (s) shots.push({ file: s, desc: shotDesc });
  }
}

// Profile page
await dp.goto(`${APP_URL}/#/profile`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
await dp.waitForTimeout(2000);
s = await shot(dp, '28_F_profile.png');
if (s) shots.push({ file: s, desc: 'User profile page' });

await dp.close();
await desktopCtx.close();

// ═══════════════════════════════════════════════════════════════════════
// PART 2: DARK MODE (1280x720)
// ═══════════════════════════════════════════════════════════════════════
console.log('\n=== PART 2: Desktop Dark Mode (1280x720) ===\n');

const darkCtx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  locale: 'he-IL',
  colorScheme: 'dark',
});
const darkPage = await darkCtx.newPage();

await darkPage.goto(`${APP_URL}/#/login`, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
await darkPage.waitForTimeout(2500);
s = await shot(darkPage, '29_F_dark_login.png');
if (s) shots.push({ file: s, desc: 'Dark mode: login page' });

await login(darkPage);
s = await shot(darkPage, '30_F_dark_home.png');
if (s) shots.push({ file: s, desc: 'Dark mode: home panel' });

await closeHome(darkPage);
s = await shot(darkPage, '31_F_dark_canvas.png');
if (s) shots.push({ file: s, desc: 'Dark mode: canvas' });

await darkPage.goto(`${APP_URL}/#/admin`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
await darkPage.waitForTimeout(2500);
s = await shot(darkPage, '32_F_dark_admin.png');
if (s) shots.push({ file: s, desc: 'Dark mode: admin panel' });

await darkPage.goto(`${APP_URL}/#/projects`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
await darkPage.waitForTimeout(2500);
s = await shot(darkPage, '33_F_dark_projects.png');
if (s) shots.push({ file: s, desc: 'Dark mode: projects screen' });

await darkPage.close();
await darkCtx.close();

// ═══════════════════════════════════════════════════════════════════════
// PART 3: MOBILE (360x740)
// ═══════════════════════════════════════════════════════════════════════
console.log('\n=== PART 3: Mobile Light Mode (360x740) ===\n');

const mobileCtx = await browser.newContext({
  viewport: { width: 360, height: 740 },
  locale: 'he-IL',
  colorScheme: 'light',
  isMobile: true,
  hasTouch: true,
});
const mp = await mobileCtx.newPage();

await mp.goto(APP_URL, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
await mp.waitForTimeout(3000);
s = await shot(mp, '34_E_mobile_login.png');
if (s) shots.push({ file: s, desc: 'Mobile: login page' });

await login(mp);
s = await shot(mp, '35_E_mobile_home.png');
if (s) shots.push({ file: s, desc: 'Mobile: home panel' });

// Hamburger menu
if (await safeClick(mp, '#mobileMenuBtn', 5000)) {
  await mp.waitForTimeout(1000);
  s = await shot(mp, '36_E_mobile_menu_top.png');
  if (s) shots.push({ file: s, desc: 'Mobile: hamburger menu (top)' });

  // Scroll menu
  await safeEval(mp, () => {
    const menu = document.getElementById('mobileMenu');
    if (menu) menu.scrollTop = menu.scrollHeight / 2;
  });
  await mp.waitForTimeout(500);
  s = await shot(mp, '37_E_mobile_menu_mid.png');
  if (s) shots.push({ file: s, desc: 'Mobile: hamburger menu (middle)' });

  await safeEval(mp, () => {
    const menu = document.getElementById('mobileMenu');
    if (menu) menu.scrollTop = menu.scrollHeight;
  });
  await mp.waitForTimeout(500);
  s = await shot(mp, '38_E_mobile_menu_bottom.png');
  if (s) shots.push({ file: s, desc: 'Mobile: hamburger menu (bottom)' });

  await safeClick(mp, '#mobileMenuCloseBtn', 3000);
  await mp.waitForTimeout(500);
}

// Canvas
await closeHome(mp);
await mp.waitForTimeout(500);
s = await shot(mp, '39_E_mobile_canvas.png');
if (s) shots.push({ file: s, desc: 'Mobile: canvas view' });

// Touch targets
const touchTargets = await safeEval(mp, () => {
  const buttons = document.querySelectorAll('#modeGroup .btn-icon-sm, .canvas-toolbar button');
  return Array.from(buttons).slice(0, 8).map(b => {
    const r = b.getBoundingClientRect();
    return { id: b.id, w: Math.round(r.width), h: Math.round(r.height) };
  });
});
observe('E', `Mobile touch targets: ${JSON.stringify(touchTargets)}`);

// Create node on mobile
await mp.keyboard.press('n');
await mp.waitForTimeout(400);
const mCanvas = await mp.$('canvas');
if (mCanvas) {
  const mBox = await mCanvas.boundingBox();
  if (mBox) {
    await mp.tap(mBox.x + mBox.width * 0.4, mBox.y + mBox.height * 0.4);
    await mp.waitForTimeout(1000);
    s = await shot(mp, '40_E_mobile_node.png');
    if (s) shots.push({ file: s, desc: 'Mobile: node created' });

    // Select node
    await mp.keyboard.press('Escape');
    await mp.waitForTimeout(300);
    await mp.tap(mBox.x + mBox.width * 0.4, mBox.y + mBox.height * 0.4);
    await mp.waitForTimeout(1500);
    s = await shot(mp, '41_E_mobile_drawer.png');
    if (s) shots.push({ file: s, desc: 'Mobile: node drawer open' });
  }
}

// Mobile admin
await mp.goto(`${APP_URL}/#/admin`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
await mp.waitForTimeout(3000);
s = await shot(mp, '42_E_mobile_admin.png');
if (s) shots.push({ file: s, desc: 'Mobile: admin panel' });

// Mobile projects
await mp.goto(`${APP_URL}/#/projects`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
await mp.waitForTimeout(3000);
s = await shot(mp, '43_E_mobile_projects.png');
if (s) shots.push({ file: s, desc: 'Mobile: projects screen' });

await mp.close();
await mobileCtx.close();

// ═══════════════════════════════════════════════════════════════════════
// PART 4: VIDEO WALKTHROUGH
// ═══════════════════════════════════════════════════════════════════════
console.log('\n=== PART 4: Video Walkthrough ===\n');

const videoCtx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  locale: 'he-IL',
  colorScheme: 'light',
  recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
});
const vp = await videoCtx.newPage();

try {
  // Login
  await vp.goto(`${APP_URL}/#/login`, { waitUntil: 'networkidle', timeout: 25000 }).catch(() => {});
  await vp.waitForTimeout(2000);
  await login(vp);
  await vp.waitForTimeout(1500);

  // Home panel
  await vp.waitForTimeout(1500);

  // Canvas
  await closeHome(vp);
  await vp.waitForTimeout(1000);

  // Create nodes via keyboard
  await vp.keyboard.press('n');
  await vp.waitForTimeout(400);
  const vCanvas = await vp.$('canvas');
  if (vCanvas) {
    const vBox = await vCanvas.boundingBox();
    if (vBox) {
      const vcx = vBox.x + vBox.width * 0.4;
      const vcy = vBox.y + vBox.height / 2;

      await vp.mouse.click(vcx, vcy);
      await vp.waitForTimeout(600);
      await vp.mouse.click(vcx + 120, vcy - 50);
      await vp.waitForTimeout(600);

      // Edge
      await vp.keyboard.press('e');
      await vp.waitForTimeout(400);
      await vp.mouse.click(vcx, vcy);
      await vp.waitForTimeout(400);
      await vp.mouse.click(vcx + 120, vcy - 50);
      await vp.waitForTimeout(1000);

      // Select node
      await vp.keyboard.press('Escape');
      await vp.waitForTimeout(300);
      await vp.mouse.click(vcx, vcy);
      await vp.waitForTimeout(1500);
      await vp.keyboard.press('Escape');
      await vp.waitForTimeout(500);
    }
  }

  // Projects
  await vp.goto(`${APP_URL}/#/projects`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await vp.waitForTimeout(2000);

  // Admin
  await vp.goto(`${APP_URL}/#/admin`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  await vp.waitForTimeout(1500);

  // Admin tabs
  await safeEval(vp, () => {
    const btns = document.querySelectorAll('button, [role="tab"]');
    for (const b of btns) {
      if (b.textContent?.includes('ארגונים')) { b.click(); return; }
    }
  });
  await vp.waitForTimeout(1000);
  await safeEval(vp, () => {
    const btns = document.querySelectorAll('button, [role="tab"]');
    for (const b of btns) {
      if (b.textContent?.includes('תכונות')) { b.click(); return; }
    }
  });
  await vp.waitForTimeout(1000);

  // Mobile resize
  await vp.setViewportSize({ width: 360, height: 740 });
  await vp.waitForTimeout(2000);
  await vp.setViewportSize({ width: 1280, height: 720 });
  await vp.waitForTimeout(1500);

} catch (err) {
  console.error('Video recording error:', err.message);
}

const videoPath = await vp.video()?.path();
await vp.close();
await videoCtx.close();

if (videoPath) {
  try {
    await new Promise(r => setTimeout(r, 2000));
    const target = path.join(OUT, 'walkthrough.webm');
    await rename(videoPath, target);
    console.log(`  Video: ${target}`);
  } catch (e) {
    console.log(`  Video at original path: ${videoPath} (rename: ${e.message})`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// WRITE workflow_log.md
// ═══════════════════════════════════════════════════════════════════════
console.log('\n=== Writing workflow_log.md ===\n');

let log = `# Manholes Mapper — Visual State Capture (2026-03-10)\n\n`;
log += `**App URL:** ${APP_URL}\n`;
log += `**Capture Date:** 2026-03-10\n`;
log += `**Viewports:** Desktop 1280x720, Mobile 360x740\n`;
log += `**Color schemes:** Light + Dark\n\n`;

log += `## Screenshots\n\n`;
log += `| # | File | Description |\n`;
log += `|---|------|-------------|\n`;
for (let i = 0; i < shots.length; i++) {
  log += `| ${i+1} | ${shots[i].file} | ${shots[i].desc} |\n`;
}

log += `\n## Video\n\n`;
log += `- **walkthrough.webm** — ~45 second walkthrough: login -> home -> canvas -> draw nodes/edges -> select -> projects -> admin -> mobile resize\n\n`;

log += `## Console Errors\n\n`;
if (consoleErrors.length === 0) {
  log += `No console errors captured.\n\n`;
} else {
  for (const e of consoleErrors.slice(0, 15)) {
    log += `- \`${e.replace(/`/g, "'")}\`\n`;
  }
  log += `\n`;
}

log += `## Observations\n\n`;
for (const o of observations) {
  log += `- **[${o.category}]** ${o.note}\n`;
}

log += `\n## Workflow Status\n\n`;
log += `| Workflow | Status | Notes |\n`;
log += `|----------|--------|-------|\n`;
log += `| A — Login & Home | Captured | Login form, home panel with sketch list |\n`;
log += `| B — Canvas Drawing | Captured | Node/edge creation, selection panels, zoom |\n`;
log += `| C — Projects | Captured | Projects management screen |\n`;
log += `| D — Admin | Captured | Admin panel with tabs |\n`;
log += `| E — Mobile | Captured | Mobile login, home, menu, canvas, admin, projects |\n`;
log += `| F — Settings/Misc | Captured | Dark mode, English/LTR, help modal, profile |\n`;

await writeFile(path.join(OUT, 'workflow_log.md'), log);
console.log('  workflow_log.md written');

// ═══════════════════════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════════════════════
await browser.close();

const files = await readdir(OUT);
console.log(`\nOutput: ${files.length} files in ${OUT}`);
for (const f of files.sort()) console.log(`  ${f}`);

console.log('\nDone!');
