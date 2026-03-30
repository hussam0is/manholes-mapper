const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

const SKETCH_ID = '5c062a8b-b9e1-4fff-9877-330819c6cd79';

(async () => {
  const client = await CDP({ host: 'localhost', port: 9222 });
  const { Page, Runtime } = client;
  await Page.enable();

  // Fetch the full sketch from API and set as current
  const { result } = await Runtime.evaluate({
    expression: `
      (async function() {
        const resp = await fetch('/api/sketches?id=${SKETCH_ID}', { credentials: 'include' });
        if (!resp.ok) return 'fetch err ' + resp.status + ': ' + await resp.text();
        const data = await resp.json();
        
        const nodes = data.nodes || data.sketch?.nodes || [];
        const edges = data.edges || data.sketch?.edges || [];
        const name = data.name || data.sketch?.name || 'Legacy Import';
        const creationDate = data.creationDate || data.sketch?.creationDate || '2026-03-24';
        
        localStorage.setItem('graphSketch', JSON.stringify({
          nodes, edges,
          nextNodeId: 85,
          creationDate,
          sketchId: '${SKETCH_ID}',
          sketchName: name,
          projectId: null,
          inputFlowConfig: null,
        }));
        
        return 'Set: ' + nodes.length + ' nodes, ' + edges.length + ' edges, name=' + name;
      })()
    `,
    awaitPromise: true, returnByValue: true, timeout: 15000
  });
  console.log('Result:', result.value);

  // Reload
  await Page.reload();
  await new Promise(r => setTimeout(r, 5000));

  // Check after load
  const { result: check } = await Runtime.evaluate({
    expression: `
      (function() {
        const d = JSON.parse(localStorage.getItem('graphSketch') || '{}');
        return (d.nodes||[]).length + ' nodes loaded, sketchId=' + d.sketchId;
      })()
    `,
    returnByValue: true
  });
  console.log('After reload:', check.value);

  // Fit
  await Runtime.evaluate({
    expression: `(function(){for(const b of document.querySelectorAll('button')){if(b.textContent.includes('fit_screen')){b.click();return}}})()`,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 2000));

  // Screenshot
  const { data } = await Page.captureScreenshot({ format: 'png' });
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'screenshot-final.png'), Buffer.from(data, 'base64'));
  console.log('Screenshot saved');

  await client.close();
})().catch(e => console.log('err:', e.message));
