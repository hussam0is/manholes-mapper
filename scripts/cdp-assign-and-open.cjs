const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

(async () => {
  const client = await CDP({ host: 'localhost', port: 9222 });
  const { Page, Runtime } = client;
  await Page.enable();

  // Open library
  await Runtime.evaluate({
    expression: `(function(){for(const b of document.querySelectorAll('button')){if(b.textContent.includes('folder_open')){b.click();return}}})()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 2000));

  // Click "שייך הכל" (Assign All) to assign orphan sketches to me_rakat project
  const { result: assignResult } = await Runtime.evaluate({
    expression: `
      (function() {
        const els = [...document.querySelectorAll('*')].filter(el => 
          el.textContent.trim() === 'שייך הכל' && el.offsetParent !== null
        );
        if (els[0]) { els[0].click(); return 'Clicked assign all'; }
        // Try finding by looking for the button near the warning
        for (const btn of document.querySelectorAll('button, span, a')) {
          if (btn.textContent.trim().includes('שייך הכל')) {
            btn.click();
            return 'Clicked assign: ' + btn.tagName;
          }
        }
        return 'No assign button found';
      })()
    `,
    returnByValue: true
  });
  console.log('Assign:', assignResult.value);
  await new Promise(r => setTimeout(r, 2000));

  // Now the project should show sketches. Click on me_rakat project.
  await Runtime.evaluate({
    expression: `
      (function() {
        const els = [...document.querySelectorAll('h3, h4, div')].filter(el => 
          el.textContent.includes('me_rakat') && !el.textContent.includes('ניהול') && el.offsetParent !== null
        );
        els.sort((a,b) => a.textContent.length - b.textContent.length);
        if (els[0]) els[0].click();
      })()
    `,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 2000));

  // Screenshot
  let { data } = await Page.captureScreenshot({ format: 'png' });
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'screenshot-after-assign.png'), Buffer.from(data, 'base64'));

  // Check body
  const { result: bodyResult } = await Runtime.evaluate({
    expression: `document.body.innerText.substring(0, 1200)`,
    returnByValue: true
  });
  console.log('After assign:', bodyResult.value.substring(0, 500));

  // Look for sketch items to click and open one
  const { result: sketchList } = await Runtime.evaluate({
    expression: `
      (function() {
        // Look for list items that contain "Legacy Import" or sketch dates
        const items = [...document.querySelectorAll('li, [class*=item], [class*=card], [role=button]')].filter(el =>
          (el.textContent.includes('Legacy') || el.textContent.includes('84')) && el.offsetParent !== null
        );
        return JSON.stringify(items.slice(0, 5).map(el => ({
          tag: el.tagName,
          text: el.textContent.trim().substring(0, 100),
          classes: el.className ? el.className.substring(0, 50) : ''
        })));
      })()
    `,
    returnByValue: true
  });
  console.log('Sketch items:', sketchList.value);

  await client.close();
})().catch(e => console.log('err:', e.message));
