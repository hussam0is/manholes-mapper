const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

(async () => {
  const client = await CDP({ host: 'localhost', port: 9222 });
  const { Page, Runtime } = client;
  await Page.enable();
  
  // Navigate to home
  await Page.navigate({ url: 'https://manholes-mapper.vercel.app/#/' });
  await new Promise(r => setTimeout(r, 5000));

  // Switch to "My Sketches" tab (שרטוטים שלי)
  const { result: tabClick } = await Runtime.evaluate({
    expression: `
      (function() {
        // Look for tab button with "שרטוטים" or "sketches"
        const btns = [...document.querySelectorAll('button, [role=tab], .tab')];
        for (const btn of btns) {
          const txt = btn.textContent.trim();
          if (txt.includes('שרטוטים שלי') || txt.includes('My Sketches') || txt === 'description') {
            btn.click();
            return 'Clicked: ' + txt.substring(0, 40);
          }
        }
        // Try the description icon (file icon) in top bar
        for (const btn of btns) {
          if (btn.textContent.includes('description')) {
            btn.click();
            return 'Clicked description icon';
          }
        }
        return 'No sketches tab found. Buttons: ' + btns.slice(0, 20).map(b => b.textContent.trim().substring(0, 25)).join(' | ');
      })()
    `,
    returnByValue: true
  });
  console.log('Tab:', tabClick.value);
  await new Promise(r => setTimeout(r, 2000));

  // Take screenshot
  let { data } = await Page.captureScreenshot({ format: 'png' });
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'screenshot-home-tab.png'), Buffer.from(data, 'base64'));
  
  // Look for Legacy Import in the body text
  const { result: bodyResult } = await Runtime.evaluate({
    expression: `document.body.innerText`,
    returnByValue: true
  });
  
  const text = bodyResult.value;
  if (text.includes('Legacy')) {
    console.log('Found Legacy Import!');
    const idx = text.indexOf('Legacy');
    console.log('Context:', text.substring(Math.max(0,idx-30), idx+80));
    
    // Click on it
    const { result: clickResult } = await Runtime.evaluate({
      expression: `
        (function() {
          const els = [...document.querySelectorAll('*')].filter(el => 
            el.textContent.includes('Legacy Import') && 
            el.offsetParent !== null &&
            el.textContent.length < 200
          );
          els.sort((a,b) => a.textContent.length - b.textContent.length);
          for (const el of els) {
            // Find the clickable card/item
            const card = el.closest('[class*=card], [class*=item], li, [role=button], button, a') || el;
            card.click();
            return 'Clicked: ' + card.tagName + '.' + (card.className||'').substring(0,30) + ' text=' + card.textContent.trim().substring(0, 60);
          }
          return 'Found but could not click';
        })()
      `,
      returnByValue: true
    });
    console.log('Click result:', clickResult.value);
    await new Promise(r => setTimeout(r, 4000));
    
    // Fit
    await Runtime.evaluate({
      expression: `(function(){for(const b of document.querySelectorAll('button')){if(b.textContent.includes('fit_screen')){b.click();return}}})()`,
      returnByValue: true
    });
    await new Promise(r => setTimeout(r, 2000));
    
    // Final screenshot
    ({ data } = await Page.captureScreenshot({ format: 'png' }));
    fs.writeFileSync(path.join(__dirname, '..', 'data', 'screenshot-final.png'), Buffer.from(data, 'base64'));
    
    const { result: verify } = await Runtime.evaluate({
      expression: `(function(){ const d = JSON.parse(localStorage.getItem('graphSketch')||'{}'); return (d.nodes||[]).length + ' nodes' })()`,
      returnByValue: true
    });
    console.log('Final verify:', verify.value);
    console.log('Screenshots saved!');
  } else {
    console.log('Legacy Import not visible. Looking at what IS visible...');
    console.log(text.substring(0, 800));
  }

  await client.close();
})().catch(e => console.log('err:', e.message));
