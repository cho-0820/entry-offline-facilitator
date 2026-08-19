const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

(async () => {
  async function capture(page, prefix) {
    const logs = [];
    page.on('console', msg => logs.push(msg.text()));
    try {
      await page.waitForFunction(() => window.Entry && window.Entry.container, { timeout: 15000 });
    } catch (e) {
      console.error('Entry not ready');
    }
    // wait a bit for any errors to surface
    await new Promise(r => setTimeout(r, 4000));
    const screenshot = path.join(__dirname, `${prefix}_screenshot.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    return { logs, screenshot };
  }

  // Electron (remote debugging port 9222). Assume electron already running.
  let electron = { logs: [], screenshot: '' };
  try {
    const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222' });
    const pages = await browser.pages();
    if (pages.length) electron = await capture(pages[0], 'electron');
    await browser.disconnect();
  } catch (e) {
    console.warn('Electron connect failed:', e.message);
  }

  // Web build
  const webBrowser = await puppeteer.launch({
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const webPage = await webBrowser.newPage();
  await webPage.goto('http://localhost:3000/src/main/views/main.html', { waitUntil: 'networkidle2' });
  const web = await capture(webPage, 'web');
  await webBrowser.close();

  const result = { electron, web };
  const out = path.join(__dirname, 'error_check_results.json');
  fs.writeFileSync(out, JSON.stringify(result, null, 2), 'utf-8');
  console.log('Result written to', out);
})();
