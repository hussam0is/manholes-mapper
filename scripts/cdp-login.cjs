const CDP = require('chrome-remote-interface');
const fs = require('fs');
const path = require('path');

(async () => {
  const client = await CDP({ host: 'localhost', port: 9222 });
  const { Page, Runtime } = client;
  await Page.enable();

  // Fill in the login form
  const { result: loginResult } = await Runtime.evaluate({
    expression: `
      (async function() {
        const inputs = document.querySelectorAll('input');
        let emailInput = null, passInput = null;
        for (const inp of inputs) {
          const t = inp.type || '';
          if (t === 'email' || inp.name === 'email') emailInput = inp;
          if (t === 'password' || inp.name === 'password') passInput = inp;
        }
        if (!emailInput) {
          // Fallback: first text-like input
          for (const inp of inputs) {
            if (inp.type === 'text' || inp.type === '' || !inp.type) { emailInput = inp; break; }
          }
        }
        if (!emailInput || !passInput) return 'ERROR: fields not found. inputs=' + inputs.length;
        
        // Set values
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        
        setter.call(emailInput, 'admin@geopoint.me');
        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
        emailInput.dispatchEvent(new Event('change', { bubbles: true }));
        
        setter.call(passInput, 'Geopoint2026!');
        passInput.dispatchEvent(new Event('input', { bubbles: true }));
        passInput.dispatchEvent(new Event('change', { bubbles: true }));
        
        await new Promise(r => setTimeout(r, 500));
        
        // Find the actual submit button — not the visibility toggle
        // Look for a button whose text is exactly the login text, inside a form
        const form = document.querySelector('form');
        if (form) {
          // Try submitting the form directly
          const submitBtns = form.querySelectorAll('button');
          for (const btn of submitBtns) {
            const txt = btn.textContent.trim();
            // Skip the visibility toggle icon
            if (txt === 'visibility' || txt === 'visibility_off') continue;
            if (txt.includes('התחבר') || txt.includes('Login') || txt.includes('Sign in')) {
              btn.click();
              return 'Clicked form button: ' + txt;
            }
          }
          // If no text match, submit the form
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          return 'Dispatched form submit';
        }
        
        // Fallback: find any button with login text
        const allBtns = [...document.querySelectorAll('button')];
        for (const btn of allBtns) {
          const txt = btn.textContent.trim();
          if (txt === 'visibility' || txt === 'visibility_off') continue;
          if (txt.includes('התחבר') || txt === 'Login' || txt === 'Sign in') {
            btn.click();
            return 'Clicked button: ' + txt;
          }
        }
        
        return 'ERROR: no submit button found. Buttons: ' + allBtns.map(b => b.textContent.trim()).join(' | ');
      })()
    `,
    awaitPromise: true,
    returnByValue: true,
    timeout: 10000
  });
  console.log('Login action:', loginResult.value);

  // Wait for auth
  console.log('Waiting for auth response...');
  await new Promise(r => setTimeout(r, 6000));

  // Check result
  const { result: statusResult } = await Runtime.evaluate({
    expression: `
      (function() {
        const url = window.location.href;
        const hasCanvas = !!document.querySelector('canvas');
        const bodyText = document.body.innerText.substring(0, 200);
        const hasLoginForm = !!document.querySelector('form input[type=password]');
        return JSON.stringify({ url, hasCanvas, hasLoginForm, bodyPreview: bodyText });
      })()
    `,
    returnByValue: true
  });
  const status = JSON.parse(statusResult.value);
  console.log('URL:', status.url);
  console.log('Has canvas:', status.hasCanvas);
  console.log('Still on login:', status.hasLoginForm);
  console.log('Body:', status.bodyPreview.substring(0, 150));

  // Screenshot
  const { data } = await Page.captureScreenshot({ format: 'png' });
  const outPath = path.join(__dirname, '..', 'data', 'screenshot-login.png');
  fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
  console.log('Screenshot saved');

  await client.close();
})().catch(e => console.log('err:', e.message));
