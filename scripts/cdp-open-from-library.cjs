const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

const SKETCH_ID = '5c062a8b-b9e1-4fff-9877-330819c6cd79';

(async () => {
  const client = await CDP({ host: 'localhost', port: 9222 });
  const { Page, Runtime } = client;
  await Page.enable();

  // First, click the library/folder icon to open the sketch library
  const { result: libResult } = await Runtime.evaluate({
    expression: `
      (function() {
        // Find folder_open button
        for (const btn of document.querySelectorAll('button')) {
          if (btn.textContent.includes('folder_open') || btn.title?.includes('library') || btn.title?.includes('ספריה')) {
            btn.click();
            return 'Clicked library button: ' + btn.textContent.trim().substring(0, 30);
          }
        }
        // Try icon
        for (const el of document.querySelectorAll('span, i')) {
          if (el.textContent.trim() === 'folder_open') {
            (el.closest('button') || el.parentElement).click();
            return 'Clicked folder_open icon';
          }
        }
        return 'No library button found';
      })()
    `,
    returnByValue: true
  });
  console.log('Library:', libResult.value);
  await new Promise(r => setTimeout(r, 2000));

  // Check what's in the library panel
  const { result: panelResult } = await Runtime.evaluate({
    expression: `
      (function() {
        // Look for sketch items in the library panel
        const items = document.querySelectorAll('[class*=library], [class*=sketch-list], [class*=sidebar] li, [class*=drawer] li');
        const texts = [...document.querySelectorAll('*')].filter(el => el.textContent.includes('Legacy Import')).map(el => el.tagName + ': ' + el.textContent.trim().substring(0, 50));
        return JSON.stringify({
          items: items.length,
          legacyMatches: texts.slice(0, 5),
          bodySnippet: document.body.innerText.substring(0, 600)
        });
      })()
    `,
    returnByValue: true
  });
  console.log('Panel:', panelResult.value);

  // Screenshot
  const { data } = await Page.captureScreenshot({ format: 'png' });
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'screenshot-library.png'), Buffer.from(data, 'base64'));
  console.log('Screenshot saved');

  await client.close();
})().catch(e => console.log('err:', e.message));
