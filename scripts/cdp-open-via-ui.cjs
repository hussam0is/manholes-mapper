const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

(async () => {
  const client = await CDP({ host: 'localhost', port: 9222 });
  const { Page, Runtime } = client;
  await Page.enable();

  // Open library drawer
  await Runtime.evaluate({
    expression: `(function(){for(const b of document.querySelectorAll('button')){if(b.textContent.includes('folder_open')){b.click();return 'ok'}}return 'none'})()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 3000));

  // Look for the "2 sketches without project" warning and expand it
  const { result: findOrphans } = await Runtime.evaluate({
    expression: `
      (function() {
        const body = document.body.innerText;
        // Find elements mentioning orphan sketches
        const els = [...document.querySelectorAll('*')].filter(el => 
          el.textContent.includes('ללא פרויקט') && el.offsetParent !== null
        );
        // Also look for "warning_amber" icon near sketch list
        const warnings = [...document.querySelectorAll('*')].filter(el =>
          el.textContent.trim() === 'warning_amber' && el.offsetParent !== null
        );
        return JSON.stringify({
          orphanElements: els.slice(0, 3).map(e => e.tagName + ': ' + e.textContent.trim().substring(0, 80)),
          warnings: warnings.length,
          bodySnippet: body.substring(body.indexOf('ללא פרויקט') - 50, body.indexOf('ללא פרויקט') + 200)
        });
      })()
    `,
    returnByValue: true
  });
  console.log('Orphans:', findOrphans.value);

  // Navigate to homepage to see all sketches listed
  // Try clicking on project "me_rakat" first
  const { result: projClick } = await Runtime.evaluate({
    expression: `
      (function() {
        const els = [...document.querySelectorAll('*')].filter(el => 
          el.textContent.includes('me_rakat') && el.offsetParent !== null
        );
        els.sort((a,b) => a.textContent.length - b.textContent.length);
        if (els[0]) { els[0].click(); return 'clicked me_rakat: ' + els[0].tagName; }
        return 'not found';
      })()
    `,
    returnByValue: true
  });
  console.log('Project click:', projClick.value);
  await new Promise(r => setTimeout(r, 2000));

  // Screenshot
  let { data } = await Page.captureScreenshot({ format: 'png' });
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'screenshot-project.png'), Buffer.from(data, 'base64'));

  // Now look for sketches list inside the project
  const { result: sketches } = await Runtime.evaluate({
    expression: `
      (function() {
        return document.body.innerText.substring(0, 1200);
      })()
    `,
    returnByValue: true
  });
  console.log('Body after project click:', sketches.value.substring(0, 600));

  // Go back and try navigating directly to /#/home or /#/library
  await Page.navigate({ url: 'https://manholes-mapper.vercel.app/#/home' });
  await new Promise(r => setTimeout(r, 3000));

  ({ data } = await Page.captureScreenshot({ format: 'png' }));
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'screenshot-home.png'), Buffer.from(data, 'base64'));

  const { result: homeBody } = await Runtime.evaluate({
    expression: `document.body.innerText.substring(0, 1000)`,
    returnByValue: true
  });
  console.log('Home page:', homeBody.value.substring(0, 400));

  await client.close();
})().catch(e => console.log('err:', e.message));
