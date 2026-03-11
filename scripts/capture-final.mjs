/**
 * capture-final.mjs — Final captures: real sketch, video, signup, admin settings
 */
import { chromium } from 'playwright';
import { mkdir, rename, readdir } from 'fs/promises';
import path from 'path';

const APP_URL = 'https://manholes-mapper.vercel.app';
const EMAIL = 'admin@geopoint.me';
const PASSWORD = 'Geopoint2026!';
const OUT = 'C:/Users/murjan.a/Documents/manholes-mapper-dev-branch/manholes-mapper/app_state_2026-03-10';

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });

async function shot(page, name) {
  try {
    await page.screenshot({ path: path.join(OUT, name), fullPage: false });
    console.log(`  >> ${name}`);
  } catch (e) {
    console.log(`  !! ${name}: ${e.message.substring(0, 80)}`);
  }
}

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
    await page.waitForTimeout(4500);
  } catch (e) {
    console.log(`  !! login: ${e.message.substring(0, 80)}`);
  }
}

// ═══ 1. Real sketch with data ═══
console.log('\n=== 1. Real sketch with data ===\n');

const ctx1 = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  locale: 'he-IL',
  colorScheme: 'light',
});
const p1 = await ctx1.newPage();

await p1.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
await p1.waitForTimeout(3000);
await login(p1);
await p1.waitForTimeout(2000);

// Switch to org tab
await p1.evaluate(() => {
  const tab = document.getElementById('organizationTab');
  if (tab) tab.click();
}).catch(() => {});
await p1.waitForTimeout(2000);

// Click a sketch with data
const sketchClicked = await p1.evaluate(() => {
  const list = document.getElementById('sketchList');
  if (!list || list.children.length === 0) return false;
  const target = list.children.length > 1 ? list.children[1] : list.children[0];
  const btn = target.querySelector('button, a');
  if (btn) { btn.click(); return true; }
  target.click();
  return true;
}).catch(() => false);
console.log(`  Sketch clicked: ${sketchClicked}`);
await p1.waitForTimeout(4000);

// Zoom to fit
await p1.evaluate(() => {
  const fab = document.getElementById('canvasFabToggle');
  if (fab) fab.click();
}).catch(() => {});
await p1.waitForTimeout(700);
await p1.evaluate(() => {
  const btn = document.getElementById('zoomToFitBtn');
  if (btn) btn.click();
}).catch(() => {});
await p1.waitForTimeout(2000);
await p1.evaluate(() => {
  const fab = document.getElementById('canvasFabToggle');
  if (fab) fab.click();
}).catch(() => {});
await p1.waitForTimeout(500);

await shot(p1, '50_B_real_sketch.png');

// Try to select a node
const cBox = await p1.evaluate(() => {
  const c = document.getElementById('graphCanvas');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
}).catch(() => null);

if (cBox) {
  for (const [rx, ry] of [[0.35,0.35],[0.4,0.4],[0.45,0.45],[0.5,0.3],[0.3,0.5],[0.5,0.5],[0.55,0.35],[0.6,0.4]]) {
    await p1.mouse.click(cBox.x + cBox.w * rx, cBox.y + cBox.h * ry);
    await p1.waitForTimeout(1500);
    const has = await p1.evaluate(() => {
      const dc = document.getElementById('detailsContainer');
      const def = document.getElementById('detailsDefault');
      return dc && dc.children.length > 0 && (!def || window.getComputedStyle(def).display === 'none');
    }).catch(() => false);
    if (has) {
      await shot(p1, '51_B_real_node_detail.png');
      break;
    }
  }
}

await p1.close();
await ctx1.close();

// ═══ 2. Signup page ═══
console.log('\n=== 2. Signup page ===\n');

const ctx2 = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  locale: 'he-IL',
  colorScheme: 'light',
});
const p2 = await ctx2.newPage();
await p2.goto(`${APP_URL}/#/signup`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
await p2.waitForTimeout(3000);
await shot(p2, '52_A_signup.png');
await p2.close();
await ctx2.close();

// ═══ 3. Desktop admin settings (via force-display) ═══
console.log('\n=== 3. Admin settings ===\n');

const ctx3 = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  locale: 'he-IL',
  colorScheme: 'light',
});
const p3 = await ctx3.newPage();
await p3.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
await p3.waitForTimeout(3000);
await login(p3);
await p3.waitForTimeout(2000);

// Navigate to #/admin
await p3.evaluate(() => { window.location.hash = '#/admin'; });
await p3.waitForTimeout(3000);

// The #/admin route shows the home/projects panel overlay.
// The actual admin screen is rendered by src/admin/admin-panel.js
// Let's force-display it to see what it looks like
const adminForced = await p3.evaluate(() => {
  const screen = document.getElementById('adminScreen');
  if (!screen) return false;
  screen.style.display = 'flex';
  screen.hidden = false;
  // Hide other overlays
  const hp = document.getElementById('homePanel');
  if (hp) { hp.style.display = 'none'; }
  return true;
}).catch(() => false);
console.log(`  Admin screen forced: ${adminForced}`);
await p3.waitForTimeout(1000);
await shot(p3, '53_D_admin_settings.png');

await p3.close();
await ctx3.close();

// ═══ 4. Video walkthrough ═══
console.log('\n=== 4. Video ===\n');

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
  await vp.waitForTimeout(2000);

  // Home/Projects
  await vp.waitForTimeout(1500);

  // Close home
  await vp.evaluate(() => { document.getElementById('homePanelCloseBtn')?.click(); }).catch(() => {});
  await vp.waitForTimeout(1500);

  // Create nodes
  await vp.keyboard.press('n');
  await vp.waitForTimeout(500);

  const vCanvas = await vp.$('canvas');
  if (vCanvas) {
    const vBox = await vCanvas.boundingBox();
    if (vBox) {
      const vcx = vBox.x + vBox.width * 0.4;
      const vcy = vBox.y + vBox.height / 2;
      await vp.mouse.click(vcx, vcy);
      await vp.waitForTimeout(700);
      await vp.mouse.click(vcx + 120, vcy - 50);
      await vp.waitForTimeout(700);

      await vp.keyboard.press('e');
      await vp.waitForTimeout(500);
      await vp.mouse.click(vcx, vcy);
      await vp.waitForTimeout(400);
      await vp.mouse.click(vcx + 120, vcy - 50);
      await vp.waitForTimeout(1200);

      await vp.keyboard.press('Escape');
      await vp.waitForTimeout(400);
      await vp.mouse.click(vcx, vcy);
      await vp.waitForTimeout(1500);
      await vp.keyboard.press('Escape');
      await vp.waitForTimeout(600);
    }
  }

  // Projects
  await vp.evaluate(() => { window.location.hash = '#/projects'; });
  await vp.waitForTimeout(2500);

  // Open project
  await vp.evaluate(() => {
    const btns = document.querySelectorAll('button');
    for (const b of btns) {
      if (b.textContent?.includes('פתח פרויקט')) { b.click(); return; }
    }
  }).catch(() => {});
  await vp.waitForTimeout(4000);

  // Back
  await vp.evaluate(() => { window.location.hash = '#/projects'; });
  await vp.waitForTimeout(1500);

  // Mobile resize
  await vp.setViewportSize({ width: 360, height: 740 });
  await vp.waitForTimeout(2000);
  await vp.setViewportSize({ width: 1280, height: 720 });
  await vp.waitForTimeout(1500);

} catch (err) {
  console.error('Video error:', err.message);
}

const videoPath = await vp.video()?.path();
await vp.close();
await videoCtx.close();

if (videoPath) {
  try {
    await new Promise(r => setTimeout(r, 2000));
    const target = path.join(OUT, 'walkthrough.webm');
    await rename(videoPath, target);
    console.log(`  Video saved: ${target}`);
  } catch (e) {
    console.log(`  Video at: ${videoPath} (${e.message})`);
  }
}

await browser.close();

const files = await readdir(OUT);
console.log(`\nOutput: ${files.length} files`);
for (const f of files.sort()) console.log(`  ${f}`);
console.log('\nFinal capture done!');
