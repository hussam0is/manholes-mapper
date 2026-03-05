/**
 * Capture screenshots of the Manholes Mapper app for design audit.
 * Usage: node scripts/capture-app-state.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const OUTPUT_DIR = join(process.cwd(), 'app_state_2026-03-04');
const BASE_URL = 'http://localhost:5173';
const CREDENTIALS = { email: 'admin@geopoint.me', password: 'Geopoint2026!' };

if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

async function screenshot(page, name) {
  const path = join(OUTPUT_DIR, name);
  await page.screenshot({ path, fullPage: false });
  console.log(`  Captured: ${name}`);
}

async function getConsoleErrors(page) {
  return page.evaluate(() => {
    // Collect any visible error indicators
    const errors = [];
    // Check for error overlay (Vite HMR error)
    const overlay = document.querySelector('vite-error-overlay');
    if (overlay) errors.push('Vite error overlay present');
    return errors;
  });
}

async function main() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });

  // Desktop viewport
  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    locale: 'he-IL',
  });

  const page = await desktopContext.newPage();

  // Collect console errors
  const consoleMessages = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleMessages.push({ type: msg.type(), text: msg.text() });
    }
  });
  page.on('pageerror', (err) => {
    consoleMessages.push({ type: 'pageerror', text: err.message });
  });

  // ===== STEP 1: Initial navigation =====
  console.log('\n--- Step 1: Navigate to app ---');
  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    console.log('  Network idle timeout, continuing...');
  }
  await page.waitForTimeout(2000);
  await screenshot(page, '01_initial_load.png');

  // Check what page loaded
  const currentUrl = page.url();
  const currentHash = await page.evaluate(() => window.location.hash);
  console.log(`  URL: ${currentUrl}`);
  console.log(`  Hash: ${currentHash}`);

  // Check visible panels
  const visiblePanels = await page.evaluate(() => {
    const panels = {
      loginPanel: document.getElementById('loginPanel'),
      homePanel: document.getElementById('homePanel'),
      startPanel: document.getElementById('startPanel'),
      authLoadingOverlay: document.getElementById('authLoadingOverlay'),
      canvas: document.getElementById('graphCanvas'),
      adminScreen: document.getElementById('adminScreen'),
      projectsScreen: document.getElementById('projectsScreen'),
    };
    const result = {};
    for (const [name, el] of Object.entries(panels)) {
      if (el) {
        const style = window.getComputedStyle(el);
        result[name] = {
          exists: true,
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          hidden: el.hidden,
          classList: [...el.classList],
        };
      } else {
        result[name] = { exists: false };
      }
    }
    return result;
  });
  console.log('  Visible panels:', JSON.stringify(visiblePanels, null, 2));

  // ===== STEP 2: DOM Structure Snapshot =====
  console.log('\n--- Step 2: DOM Structure ---');
  const domSnapshot = await page.evaluate(() => {
    function describeElement(el, depth = 0) {
      if (depth > 3) return null;
      const children = [];
      for (const child of el.children) {
        if (child.tagName === 'SCRIPT' || child.tagName === 'STYLE') continue;
        const style = window.getComputedStyle(child);
        if (style.display === 'none' && !child.id) continue;
        const info = {
          tag: child.tagName.toLowerCase(),
          id: child.id || undefined,
          classes: child.className ? child.className.toString().substring(0, 100) : undefined,
          display: style.display !== 'none' ? undefined : 'none',
          text: child.children.length === 0 ? child.textContent?.substring(0, 50) : undefined,
        };
        const childNodes = describeElement(child, depth + 1);
        if (childNodes && childNodes.length > 0) info.children = childNodes;
        children.push(info);
      }
      return children;
    }
    return describeElement(document.body);
  });
  console.log('  Top-level DOM:', JSON.stringify(domSnapshot?.slice(0, 15), null, 2));

  // ===== STEP 3: Check if login page, attempt login =====
  const isLoginVisible = visiblePanels.loginPanel?.exists &&
    visiblePanels.loginPanel?.display !== 'none' &&
    !visiblePanels.loginPanel?.hidden;

  if (isLoginVisible) {
    console.log('\n--- Step 3: Login Page Detected ---');
    await screenshot(page, '02_A_login_page.png');

    // Check login form state
    const loginState = await page.evaluate(() => {
      const authContainer = document.getElementById('authContainer');
      const loginTitle = document.getElementById('loginTitle');
      const loginSubtitle = document.getElementById('loginSubtitle');
      const loadingText = document.getElementById('loginLoadingText');
      return {
        titleText: loginTitle?.textContent,
        subtitleText: loginSubtitle?.textContent,
        loadingText: loadingText?.textContent,
        loadingVisible: loadingText ? window.getComputedStyle(loadingText).display !== 'none' : false,
        authContainerHTML: authContainer?.innerHTML?.substring(0, 500),
      };
    });
    console.log('  Login state:', JSON.stringify(loginState, null, 2));

    // Try to login
    console.log('  Attempting login...');

    // Wait for auth form to render
    await page.waitForTimeout(3000);
    await screenshot(page, '03_A_login_form_ready.png');

    // Check if React auth form is rendered
    const authFormReady = await page.evaluate(() => {
      const emailInput = document.querySelector('input[type="email"], input[name="email"]');
      const passwordInput = document.querySelector('input[type="password"], input[name="password"]');
      return {
        emailInput: !!emailInput,
        passwordInput: !!passwordInput,
        emailPlaceholder: emailInput?.placeholder,
        passwordPlaceholder: passwordInput?.placeholder,
      };
    });
    console.log('  Auth form state:', JSON.stringify(authFormReady, null, 2));

    if (authFormReady.emailInput && authFormReady.passwordInput) {
      await page.fill('input[type="email"], input[name="email"]', CREDENTIALS.email);
      await page.fill('input[type="password"], input[name="password"]', CREDENTIALS.password);
      await screenshot(page, '04_A_login_filled.png');

      // Submit
      const submitBtn = await page.$('button[type="submit"]');
      if (submitBtn) {
        await submitBtn.click();
        console.log('  Login submitted, waiting...');
        await page.waitForTimeout(5000);
        await screenshot(page, '05_A_post_login.png');

        const postLoginHash = await page.evaluate(() => window.location.hash);
        console.log(`  Post-login hash: ${postLoginHash}`);
      }
    }
  } else {
    console.log('\n--- Step 3: No login page visible, already authenticated or different state ---');
  }

  // ===== STEP 4: Home Panel / Sketch List =====
  console.log('\n--- Step 4: Home Panel ---');
  const homePanelState = await page.evaluate(() => {
    const homePanel = document.getElementById('homePanel');
    if (!homePanel) return { exists: false };
    const style = window.getComputedStyle(homePanel);
    return {
      exists: true,
      display: style.display,
      hidden: homePanel.hidden,
      sketchListHTML: document.getElementById('sketchList')?.innerHTML?.substring(0, 1000),
      title: document.getElementById('homeTitle')?.textContent,
    };
  });
  console.log('  Home panel:', JSON.stringify({ exists: homePanelState.exists, display: homePanelState.display }, null, 2));

  if (homePanelState.exists && homePanelState.display !== 'none') {
    await screenshot(page, '06_A_home_panel.png');
  }

  // Try navigating to home
  await page.evaluate(() => { window.location.hash = '#/'; });
  await page.waitForTimeout(2000);
  await screenshot(page, '07_A_home_route.png');

  // ===== STEP 5: Canvas State =====
  console.log('\n--- Step 5: Canvas ---');
  const canvasState = await page.evaluate(() => {
    const canvas = document.getElementById('graphCanvas');
    if (!canvas) return { exists: false };
    return {
      exists: true,
      width: canvas.width,
      height: canvas.height,
      style: {
        display: window.getComputedStyle(canvas).display,
        width: window.getComputedStyle(canvas).width,
        height: window.getComputedStyle(canvas).height,
      }
    };
  });
  console.log('  Canvas:', JSON.stringify(canvasState, null, 2));

  // ===== STEP 6: Navigate to #/projects =====
  console.log('\n--- Step 6: Projects Route ---');
  await page.evaluate(() => { window.location.hash = '#/projects'; });
  await page.waitForTimeout(2000);
  await screenshot(page, '08_C_projects_page.png');

  // ===== STEP 7: Navigate to #/admin =====
  console.log('\n--- Step 7: Admin Route ---');
  await page.evaluate(() => { window.location.hash = '#/admin'; });
  await page.waitForTimeout(2000);
  await screenshot(page, '09_D_admin_page.png');

  // ===== STEP 8: Navigate back to canvas =====
  console.log('\n--- Step 8: Back to Canvas ---');
  await page.evaluate(() => { window.location.hash = ''; });
  await page.waitForTimeout(2000);
  await screenshot(page, '10_B_canvas_view.png');

  // Check toolbar state
  const toolbarState = await page.evaluate(() => {
    const modeGroup = document.getElementById('modeGroup');
    const fabToggle = document.getElementById('canvasFabToggle');
    const header = document.getElementById('appHeader');
    return {
      modeGroup: modeGroup ? {
        display: window.getComputedStyle(modeGroup).display,
        childCount: modeGroup.children.length,
      } : null,
      fabToggle: fabToggle ? {
        display: window.getComputedStyle(fabToggle).display,
      } : null,
      header: header ? {
        display: window.getComputedStyle(header).display,
        height: window.getComputedStyle(header).height,
      } : null,
    };
  });
  console.log('  Toolbar state:', JSON.stringify(toolbarState, null, 2));

  // ===== STEP 9: Mobile viewport =====
  console.log('\n--- Step 9: Mobile Viewport (360x740) ---');
  await desktopContext.close();

  const mobileContext = await browser.newContext({
    viewport: { width: 360, height: 740 },
    locale: 'he-IL',
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobileContext.newPage();

  // Collect mobile console errors
  const mobileConsoleMessages = [];
  mobilePage.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      mobileConsoleMessages.push({ type: msg.type(), text: msg.text() });
    }
  });

  try {
    await mobilePage.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    console.log('  Mobile network idle timeout, continuing...');
  }
  await mobilePage.waitForTimeout(3000);
  await screenshot(mobilePage, '11_E_mobile_initial.png');

  // Check if login needed on mobile
  const mobileLoginVisible = await mobilePage.evaluate(() => {
    const loginPanel = document.getElementById('loginPanel');
    if (!loginPanel) return false;
    return window.getComputedStyle(loginPanel).display !== 'none' && !loginPanel.hidden;
  });

  if (mobileLoginVisible) {
    console.log('  Mobile: Login page visible');
    // Try login on mobile
    const mobileAuthReady = await mobilePage.evaluate(() => {
      return !!document.querySelector('input[type="email"]');
    });
    if (mobileAuthReady) {
      await mobilePage.fill('input[type="email"], input[name="email"]', CREDENTIALS.email);
      await mobilePage.fill('input[type="password"], input[name="password"]', CREDENTIALS.password);
      await screenshot(mobilePage, '12_E_mobile_login_filled.png');

      const mobileSubmit = await mobilePage.$('button[type="submit"]');
      if (mobileSubmit) {
        await mobileSubmit.click();
        await mobilePage.waitForTimeout(5000);
        await screenshot(mobilePage, '13_E_mobile_post_login.png');
      }
    }
  }

  // Mobile canvas
  await mobilePage.evaluate(() => { window.location.hash = ''; });
  await mobilePage.waitForTimeout(2000);
  await screenshot(mobilePage, '14_E_mobile_canvas.png');

  // Mobile hamburger menu
  const mobileMenuBtn = await mobilePage.$('#mobileMenuBtn');
  if (mobileMenuBtn) {
    await mobileMenuBtn.click();
    await mobilePage.waitForTimeout(1000);
    await screenshot(mobilePage, '15_E_mobile_menu_open.png');

    // Close menu
    const closeBtn = await mobilePage.$('#mobileMenuCloseBtn');
    if (closeBtn) {
      await closeBtn.click();
      await mobilePage.waitForTimeout(500);
    }
  }

  // ===== STEP 10: Language Toggle (English) =====
  console.log('\n--- Step 10: Language Toggle ---');
  // Try English on mobile
  if (mobileMenuBtn) {
    await mobileMenuBtn.click();
    await mobilePage.waitForTimeout(1000);
    const langSelect = await mobilePage.$('#mobileLangSelect');
    if (langSelect) {
      await langSelect.selectOption('en');
      await mobilePage.waitForTimeout(1500);
      await screenshot(mobilePage, '16_F_mobile_english.png');
    }
  }

  // ===== Collect all console errors =====
  console.log('\n--- Console Errors & Warnings ---');
  console.log('Desktop console messages:', JSON.stringify(consoleMessages.slice(0, 20), null, 2));
  console.log('Mobile console messages:', JSON.stringify(mobileConsoleMessages.slice(0, 20), null, 2));

  // ===== Cleanup =====
  await mobileContext.close();
  await browser.close();

  console.log('\n--- DONE ---');
  console.log(`Screenshots saved to: ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
