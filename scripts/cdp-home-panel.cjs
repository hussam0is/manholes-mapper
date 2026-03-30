const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

(async () => {
  const client = await CDP({ host: 'localhost', port: 9222 });
  const { Page, Runtime } = client;
  await Page.enable();
  await new Promise(r => setTimeout(r, 2000));

  // Click the apps/grid icon in the toolbar
  const { result: clickApps } = await Runtime.evaluate({
    expression: `
      (function() {
        for (const btn of document.querySelectorAll('button')) {
          if (btn.textContent.trim() === 'apps') {
            btn.click();
            return 'clicked apps';
          }
        }
        return 'no apps button';
      })()
    `,
    returnByValue: true
  });
  console.log('Apps:', clickApps.value);
  await new Promise(r => setTimeout(r, 2000));

  // Screenshot
  let { data } = await Page.captureScreenshot({ format: 'png' });
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'screenshot-home-panel.png'), Buffer.from(data, 'base64'));

  // What's visible now?
  const { result: body } = await Runtime.evaluate({
    expression: `document.body.innerText.substring(0, 1500)`,
    returnByValue: true
  });
  console.log(body.value.substring(0, 600));

  // Look for a sketches tab or list
  const legacy = body.value.includes('Legacy');
  const hasSketchList = body.value.includes('שרטוטים שלי') || body.value.includes('My Sketches');
  console.log('Has Legacy:', legacy, '| Has sketch list:', hasSketchList);

  if (hasSketchList || body.value.includes('שרטוטים')) {
    // Try clicking "שרטוטים שלי" tab
    await Runtime.evaluate({
      expression: `
        (function() {
          const els = [...document.querySelectorAll('*')].filter(el => 
            el.textContent.trim().includes('שרטוטים שלי') && el.offsetParent !== null
          );
          els.sort((a,b) => a.textContent.length - b.textContent.length);
          if (els[0]) els[0].click();
        })()
      `,
      returnByValue: true
    });
    await new Promise(r => setTimeout(r, 2000));

    // Screenshot
    ({ data } = await Page.captureScreenshot({ format: 'png' }));
    fs.writeFileSync(path.join(__dirname, '..', 'data', 'screenshot-sketches-tab.png'), Buffer.from(data, 'base64'));
    
    const { result: body2 } = await Runtime.evaluate({
      expression: `document.body.innerText`,
      returnByValue: true
    });
    if (body2.value.includes('Legacy')) {
      console.log('Found Legacy Import in sketches tab!');
    }
    console.log(body2.value.substring(0, 800));
  }

  await client.close();
})().catch(e => console.log('err:', e.message));
