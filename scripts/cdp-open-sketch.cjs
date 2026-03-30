const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

(async () => {
  const client = await CDP({ host: 'localhost', port: 9222 });
  const { Page, Runtime } = client;
  await Page.enable();

  // Click on me_rakat project name to expand/enter it
  const { result: r1 } = await Runtime.evaluate({
    expression: `
      (function() {
        // Find the project heading
        const h3s = [...document.querySelectorAll('h3')].filter(el => el.textContent.includes('me_rakat'));
        if (h3s[0]) { h3s[0].click(); return 'clicked h3'; }
        // Try the "2 שרטוטים" text
        const els = [...document.querySelectorAll('*')].filter(el => 
          el.textContent.includes('2 שרטוטים') && !el.textContent.includes('ניהול') && el.offsetParent
        );
        els.sort((a,b) => a.textContent.length - b.textContent.length);
        if (els[0]) { els[0].click(); return 'clicked sketch count'; }
        return 'nothing found';
      })()
    `,
    returnByValue: true
  });
  console.log('Click project:', r1.value);
  await new Promise(r => setTimeout(r, 2000));

  // Screenshot to see what opened
  let { data } = await Page.captureScreenshot({ format: 'png' });
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'screenshot-project-expand.png'), Buffer.from(data, 'base64'));

  const { result: bodyResult } = await Runtime.evaluate({
    expression: `document.body.innerText`,
    returnByValue: true
  });
  
  // See if there's a sketch list now
  const text = bodyResult.value;
  const legacyIdx = text.indexOf('Legacy');
  if (legacyIdx >= 0) {
    console.log('Found Legacy Import at index', legacyIdx);
    console.log('Context:', text.substring(Math.max(0, legacyIdx - 50), legacyIdx + 100));
    
    // Click on the Legacy Import sketch
    const { result: clickSketch } = await Runtime.evaluate({
      expression: `
        (function() {
          const els = [...document.querySelectorAll('*')].filter(el => 
            el.textContent.includes('Legacy Import') && el.offsetParent !== null
          );
          els.sort((a,b) => a.textContent.length - b.textContent.length);
          if (els[0]) { els[0].click(); return 'clicked: ' + els[0].tagName + ' text=' + els[0].textContent.trim().substring(0, 60); }
          return 'not found';
        })()
      `,
      returnByValue: true
    });
    console.log('Click sketch:', clickSketch.value);
    await new Promise(r => setTimeout(r, 3000));
    
    // Fit to screen
    await Runtime.evaluate({
      expression: `(function(){for(const b of document.querySelectorAll('button')){if(b.textContent.includes('fit_screen')){b.click();return}}})()`,
      returnByValue: true
    });
    await new Promise(r => setTimeout(r, 2000));
    
    // Final screenshot
    ({ data } = await Page.captureScreenshot({ format: 'png' }));
    fs.writeFileSync(path.join(__dirname, '..', 'data', 'screenshot-final.png'), Buffer.from(data, 'base64'));
    console.log('Final screenshot saved');
    
    // Verify
    const { result: verify } = await Runtime.evaluate({
      expression: `(function(){ const d = JSON.parse(localStorage.getItem('graphSketch')||'{}'); return (d.nodes||[]).length + ' nodes, id=' + d.sketchId })()`,
      returnByValue: true
    });
    console.log('Verify:', verify.value);
  } else {
    console.log('No Legacy Import found. Body snippet:', text.substring(0, 600));
  }

  await client.close();
})().catch(e => console.log('err:', e.message));
