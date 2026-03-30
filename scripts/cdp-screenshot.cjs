const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

(async () => {
  const client = await CDP({ host: 'localhost', port: 9222 });
  await new Promise(r => setTimeout(r, 2000));
  
  const { data } = await client.Page.captureScreenshot({ format: 'png' });
  const outPath = path.join(__dirname, '..', 'data', 'screenshot-after-import.png');
  fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
  console.log('Screenshot saved to', outPath);
  
  const { result } = await client.Runtime.evaluate({
    expression: "document.querySelector('canvas') ? document.querySelector('canvas').width + 'x' + document.querySelector('canvas').height : 'no canvas'",
    returnByValue: true
  });
  console.log('Canvas:', result.value);
  
  await client.close();
})().catch(e => console.log('err:', e.message));
