const puppeteer = require('puppeteer-core');

(async () => {
    try {
        const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222' });
        const pages = await browser.pages();
        const mainPage = pages.find(p => p.url().includes('main.html')) || pages[0];

        console.log('Connected to Electron via CDP port 9222.');
        console.log('Page URL:', mainPage.url());

        const isMock = await mainPage.evaluate(() => {
            return window.ipcInvoke ? window.ipcInvoke.isMock : undefined;
        });

        console.log('window.ipcInvoke exists?', await mainPage.evaluate(() => typeof window.ipcInvoke !== 'undefined'));
        console.log('window.ipcInvoke.isMock:', isMock);
        console.log('Electron IPC mode verified (isMock is undefined)?', isMock === undefined ? 'YES ✅' : 'NO ❌');

        browser.disconnect();
    } catch (e) {
        console.error('Electron CDP test error:', e.message);
    }
})();
