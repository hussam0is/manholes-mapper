const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push('PAGE_ERROR: ' + err.message));
  await page.goto('http://127.0.0.1:3333/factory', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(5000);
  const info = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const divs = document.querySelectorAll('div');
    return { canvas: !!c, divCount: divs.length, bodyText: document.body.innerText.substring(0, 300) };
  });
  console.log(JSON.stringify(info));
  console.log('ERRORS: ' + JSON.stringify(errors));
  await browser.close();
})();
