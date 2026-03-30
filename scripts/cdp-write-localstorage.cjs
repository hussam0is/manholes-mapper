const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

(async () => {
  const client = await CDP({ host: 'localhost', port: 9222 });
  const { Page, Runtime } = client;
  await Page.enable();

  const sketchData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'imported-sketch.json'), 'utf8'));
  const sketch = sketchData.sketch;
  
  // Build the localStorage format the app expects
  const lsData = {
    nodes: sketch.nodes,
    edges: sketch.edges,
    nextNodeId: sketch.nextNodeId || 85,
    creationDate: sketch.creationDate || new Date().toISOString().slice(0, 10),
    sketchId: 'sk_' + Math.random().toString(36).substr(2, 14),
    sketchName: sketch.name || 'Legacy Import',
    projectId: null,
    inputFlowConfig: null,
  };

  const lsJson = JSON.stringify(lsData);
  console.log('localStorage payload:', (lsJson.length / 1024).toFixed(1), 'KB');

  // Inject via eval (can't pass huge strings as expression directly, use window var)
  await Runtime.evaluate({
    expression: `window.__lsPayload = ${lsJson};`
  });

  const { result } = await Runtime.evaluate({
    expression: `
      (function() {
        try {
          localStorage.setItem('graphSketch', JSON.stringify(window.__lsPayload));
          delete window.__lsPayload;
          // Verify
          const stored = JSON.parse(localStorage.getItem('graphSketch'));
          return 'OK: ' + (stored.nodes || []).length + ' nodes, ' + (stored.edges || []).length + ' edges, sketchId=' + stored.sketchId;
        } catch(e) {
          return 'ERROR: ' + e.message;
        }
      })()
    `,
    returnByValue: true
  });
  console.log('Write result:', result.value);

  // Reload to pick up
  console.log('Reloading...');
  await Page.reload();
  await new Promise(r => setTimeout(r, 4000));

  // Fit to screen
  await Runtime.evaluate({
    expression: `(function(){ const b=[...document.querySelectorAll('button')]; for(const btn of b){if(btn.textContent.includes('fit_screen')){btn.click();return'ok'}} return'no btn'})()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 1500));

  // Screenshot
  const { data } = await Page.captureScreenshot({ format: 'png' });
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'screenshot-ls.png'), Buffer.from(data, 'base64'));
  console.log('Screenshot saved');

  // Verify state
  const { result: verify } = await Runtime.evaluate({
    expression: `(function(){ const d = JSON.parse(localStorage.getItem('graphSketch')); return d ? d.nodes.length + ' nodes, ' + d.edges.length + ' edges' : 'empty'})()`,
    returnByValue: true
  });
  console.log('Verify:', verify.value);

  await client.close();
})().catch(e => console.log('err:', e.message));
