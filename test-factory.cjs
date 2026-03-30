const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  
  const consoleMessages = [];
  page.on('console', msg => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => consoleMessages.push(`[PAGE_ERROR] ${err.message}`));
  
  await page.goto('http://127.0.0.1:3333/factory', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(8000);
  
  // Check canvas
  const canvasInfo = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { found: false, html: document.body.innerHTML.substring(0, 500) };
    return { found: true, width: canvas.width, height: canvas.height, style: canvas.style.cssText };
  });
  
  console.log('Canvas:', JSON.stringify(canvasInfo));
  console.log('Console messages:');
  consoleMessages.forEach(m => console.log('  ' + m));
  
  await page.screenshot({ path: 'factory-debug.png' });
  await browser.close();
})();
