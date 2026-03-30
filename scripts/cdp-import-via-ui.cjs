const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

(async () => {
  const client = await CDP({ host: 'localhost', port: 9222 });
  const { Page, Runtime, DOM, Input } = client;
  await Page.enable();
  await DOM.enable();
  await new Promise(r => setTimeout(r, 2000));

  // Open the apps menu
  await Runtime.evaluate({
    expression: `(function(){for(const b of document.querySelectorAll('button')){if(b.textContent.trim()==='apps'){b.click();return}}})()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 1000));

  // Click "יבוא שרטוט" (Import Sketch)
  const { result: importClick } = await Runtime.evaluate({
    expression: `
      (function() {
        const els = [...document.querySelectorAll('*')].filter(el => 
          el.textContent.includes('יבוא שרטוט') && el.offsetParent !== null
        );
        els.sort((a,b) => a.textContent.length - b.textContent.length);
        if (els[0]) { 
          const btn = els[0].closest('button, li, [role=button], div[onclick]') || els[0];
          btn.click(); 
          return 'Clicked import button: ' + btn.tagName; 
        }
        return 'Not found';
      })()
    `,
    returnByValue: true
  });
  console.log('Import click:', importClick.value);
  await new Promise(r => setTimeout(r, 1000));

  // The import should open a file picker. We need to intercept it.
  // Instead of using the file picker, we'll set the file on the input element via CDP
  
  // Find the file input
  const { result: fileInputResult } = await Runtime.evaluate({
    expression: `
      (function() {
        const inputs = document.querySelectorAll('input[type=file]');
        return inputs.length + ' file inputs found';
      })()
    `,
    returnByValue: true
  });
  console.log('File inputs:', fileInputResult.value);

  // Use DOM.setFileInputFiles to set the file on the file input
  const importFilePath = path.resolve(__dirname, '..', 'data', 'imported-sketch.json');
  console.log('Import file:', importFilePath);

  // Find the file input element via CDP DOM
  const { result: fileInput } = await Runtime.evaluate({
    expression: `
      (function() {
        const input = document.querySelector('input[type=file]');
        if (!input) return null;
        return true;
      })()
    `,
    returnByValue: true
  });

  if (fileInput.value) {
    // Get the DOM node
    const { root } = await DOM.getDocument();
    const { nodeId } = await DOM.querySelector({ nodeId: root.nodeId, selector: 'input[type=file]' });
    
    // Set files using CDP
    await DOM.setFileInputFiles({
      nodeId,
      files: [importFilePath]
    });
    console.log('File set on input!');
    
    // Wait for import to process
    await new Promise(r => setTimeout(r, 5000));
    
    // Check result
    const { result: check } = await Runtime.evaluate({
      expression: `(function(){ const d = JSON.parse(localStorage.getItem('graphSketch')||'{}'); return (d.nodes||[]).length + ' nodes, id=' + d.sketchId })()`,
      returnByValue: true
    });
    console.log('After import:', check.value);
    
    // Fit to screen
    await Runtime.evaluate({
      expression: `(function(){for(const b of document.querySelectorAll('button')){if(b.textContent.includes('fit_screen')){b.click();return}}})()`,
      returnByValue: true
    });
    await new Promise(r => setTimeout(r, 2000));
    
    // Final screenshot
    const { data } = await Page.captureScreenshot({ format: 'png' });
    fs.writeFileSync(path.join(__dirname, '..', 'data', 'screenshot-final.png'), Buffer.from(data, 'base64'));
    console.log('Screenshot saved!');
  } else {
    console.log('No file input found — import may use a different method');
  }

  await client.close();
})().catch(e => console.log('err:', e.message));
