const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

(async () => {
  const client = await CDP({ host: 'localhost', port: 9222 });
  const { Page, Runtime } = client;
  await Page.enable();
  await new Promise(r => setTimeout(r, 2000));

  // Close any open panels first
  await Runtime.evaluate({
    expression: `
      (function() {
        // Close library drawer
        const closeBtn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'סגור' || b.textContent.trim() === 'close');
        if (closeBtn) closeBtn.click();
      })()
    `,
    returnByValue: true
  });
  await new Promise(r => setTimeout(r, 500));

  // Check current sketch state
  const { result: sketchState } = await Runtime.evaluate({
    expression: `
      (function() {
        const d = JSON.parse(localStorage.getItem('graphSketch') || '{}');
        return JSON.stringify({
          sketchName: d.sketchName,
          sketchId: d.sketchId,
          nodeCount: (d.nodes || []).length,
          edgeCount: (d.edges || []).length,
          sampleNodeX: d.nodes?.[0]?.x,
          sampleNodeY: d.nodes?.[0]?.y,
        });
      })()
    `,
    returnByValue: true
  });
  console.log('Sketch state:', sketchState.value);

  // Click fit_screen to zoom to content
  const { result: fitResult } = await Runtime.evaluate({
    expression: `
      (function() {
        for (const b of document.querySelectorAll('button')) {
          if (b.textContent.includes('fit_screen')) {
            b.click();
            return 'clicked fit_screen';
          }
        }
        return 'no fit button';
      })()
    `,
    returnByValue: true
  });
  console.log('Fit:', fitResult.value);
  await new Promise(r => setTimeout(r, 2000));

  // Screenshot
  let { data } = await Page.captureScreenshot({ format: 'png' });
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'screenshot-canvas-fit.png'), Buffer.from(data, 'base64'));
  console.log('Screenshot 1 saved (after fit)');

  // Check canvas dimensions and if nodes are rendered
  const { result: canvasInfo } = await Runtime.evaluate({
    expression: `
      (function() {
        const canvas = document.querySelector('canvas');
        if (!canvas) return 'no canvas';
        return JSON.stringify({
          width: canvas.width,
          height: canvas.height,
          display: canvas.style.display,
          visible: canvas.offsetParent !== null,
        });
      })()
    `,
    returnByValue: true
  });
  console.log('Canvas:', canvasInfo.value);

  await client.close();
})().catch(e => console.log('err:', e.message));
