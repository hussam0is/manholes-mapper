const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

(async () => {
  const client = await CDP({ host: 'localhost', port: 9222 });
  const { Page, Runtime } = client;
  await Page.enable();

  // Click the login button
  const { result } = await Runtime.evaluate({
    expression: `
      (function() {
        const form = document.querySelector('form');
        if (!form) return 'no form';
        const btns = [...form.querySelectorAll('button')];
        for (const btn of btns) {
          const txt = btn.textContent.trim();
          if (txt === 'התחבר') {
            btn.click();
            return 'clicked: ' + txt;
          }
        }
        return 'no login btn found. buttons: ' + btns.map(b => b.textContent.trim()).join('|');
      })()
    `,
    returnByValue: true
  });
  console.log('Click result:', result.value);

  console.log('Waiting for auth...');
  await new Promise(r => setTimeout(r, 6000));

  // Check
  const { result: s } = await Runtime.evaluate({
    expression: `JSON.stringify({
      url: location.href,
      hasLoginForm: !!document.querySelector('#password'),
      bodyStart: document.body.innerText.substring(0, 300)
    })`,
    returnByValue: true
  });
  const status = JSON.parse(s.value);
  console.log('URL:', status.url);
  console.log('Still has login form:', status.hasLoginForm);
  console.log('Body:', status.bodyStart.substring(0, 200));

  // Screenshot
  const { data } = await Page.captureScreenshot({ format: 'png' });
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'screenshot-after-login.png'), Buffer.from(data, 'base64'));
  console.log('Screenshot saved');

  await client.close();
})().catch(e => console.log('err:', e.message));
