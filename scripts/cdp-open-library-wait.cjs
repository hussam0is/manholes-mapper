const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

(async () => {
  const client = await CDP({ host: 'localhost', port: 9222 });
  const { Page, Runtime } = client;
  await Page.enable();

  // Wait for library to load (it was already opened)
  await new Promise(r => setTimeout(r, 3000));

  // Check panel content now
  const { result } = await Runtime.evaluate({
    expression: `
      (function() {
        const body = document.body.innerText;
        // Find all clickable sketch items
        const allElements = [...document.querySelectorAll('*')];
        const sketchItems = allElements.filter(el => {
          const t = el.textContent.trim();
          return (t.includes('Legacy') || t.includes('2026-03-24')) && el.tagName !== 'BODY' && el.tagName !== 'HTML';
        });
        
        // Also look for any list items in the drawer
        const listItems = [...document.querySelectorAll('li, [role=listitem], [class*=item], [class*=card]')];
        const libraryItems = listItems.filter(li => li.textContent.includes('2026'));
        
        return JSON.stringify({
          bodyHasLegacy: body.includes('Legacy'),
          bodyHasLoading: body.includes('Loading'),
          sketchItemCount: sketchItems.length,
          libraryItemCount: libraryItems.length,
          libraryItemTexts: libraryItems.slice(0, 5).map(li => li.textContent.trim().substring(0, 80)),
          bodySnippet: body.substring(body.indexOf('folder_open'), body.indexOf('folder_open') + 400)
        });
      })()
    `,
    returnByValue: true
  });
  const info = JSON.parse(result.value);
  console.log('Has Legacy:', info.bodyHasLegacy);
  console.log('Still loading:', info.bodyHasLoading);
  console.log('Library items:', info.libraryItemCount);
  console.log('Texts:', info.libraryItemTexts);
  console.log('Body near library:', info.bodySnippet.substring(0, 300));

  // Screenshot
  const { data } = await Page.captureScreenshot({ format: 'png' });
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'screenshot-library2.png'), Buffer.from(data, 'base64'));
  console.log('Screenshot saved');

  // If we see the Legacy Import sketch, click it
  if (info.bodyHasLegacy) {
    const { result: clickResult } = await Runtime.evaluate({
      expression: `
        (function() {
          const items = [...document.querySelectorAll('*')].filter(el => el.textContent.includes('Legacy Import') && el.offsetParent !== null);
          // Find the most specific (smallest) element
          items.sort((a, b) => a.textContent.length - b.textContent.length);
          if (items.length > 0) {
            items[0].click();
            return 'Clicked: ' + items[0].tagName + ' ' + items[0].textContent.trim().substring(0, 50);
          }
          return 'No Legacy Import item found to click';
        })()
      `,
      returnByValue: true
    });
    console.log('Click:', clickResult.value);
    
    await new Promise(r => setTimeout(r, 3000));
    
    // Screenshot after clicking
    const { data: data2 } = await Page.captureScreenshot({ format: 'png' });
    fs.writeFileSync(path.join(__dirname, '..', 'data', 'screenshot-opened.png'), Buffer.from(data2, 'base64'));
    console.log('Opened screenshot saved');
  }

  await client.close();
})().catch(e => console.log('err:', e.message));
