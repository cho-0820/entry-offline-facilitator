const puppeteer = require('puppeteer-core');

(async () => {
    let browser;
    try {
        console.log('Connecting to Electron debugging port at http://localhost:9222 ...');
        browser = await puppeteer.connect({
            browserURL: 'http://localhost:9222',
            defaultViewport: null
        });

        const pages = await browser.pages();
        console.log(`Found ${pages.length} pages/tabs in Electron.`);

        const mainPage = pages.find(p => p.url().includes('main.html'));
        if (!mainPage) {
            console.error('Failed to find main.html page target!');
            process.exit(1);
        }

        console.log('Successfully hooked into main.html page.');

        // Evaluate window.ipcInvoke.isMock in Electron context
        const isMockVal = await mainPage.evaluate(() => {
            if (typeof window.ipcInvoke === 'undefined') {
                return 'window.ipcInvoke is undefined';
            }
            return window.ipcInvoke.isMock;
        });

        console.log('--- VERIFICATION RESULT ---');
        console.log('window.ipcInvoke.isMock =', isMockVal);
        console.log('---------------------------');

        // Check if modal select close button is visible and click it to unlock workspace
        try {
            const closeBtnSelector = 'div.workspaceModeSelectCloseBtn';
            console.log('Waiting for mode select close button inside Electron...');
            await mainPage.waitForSelector(closeBtnSelector, { timeout: 3000 });
            console.log('Clicking mode select close button inside Electron...');
            await mainPage.click(closeBtnSelector);
            await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (e) {
            console.log('Modal close button not found or already closed:', e.message);
        }

        // Test sending query via real Electron IPC path
        try {
            console.log('Checking for chat input inside Electron...');
            const inputSelector = 'input[placeholder="코드 도우미에게 질문하기..."]';
            await mainPage.waitForSelector(inputSelector, { timeout: 5000 });

            console.log('Entering query in Electron chat input...');
            await mainPage.type(inputSelector, 'Make a thread to move object 10 times');

            console.log('Clicking send button inside Electron...');
            const sendBtnSelector = 'input[placeholder="코드 도우미에게 질문하기..."] ~ button';
            await mainPage.click(sendBtnSelector);

            console.log('Waiting for response (Electron IPC path)...');
            await new Promise(resolve => setTimeout(resolve, 20000));

            console.log('Scrolling down Electron chat panel...');
            await mainPage.evaluate(() => {
                const divs = Array.from(document.querySelectorAll('div'));
                const container = divs.find(d => d.style.overflowY === 'auto');
                if (container) {
                    container.scrollTop = container.scrollHeight;
                }
            });
        } catch (err) {
            console.error('Error during Electron chat verification:', err);
        }

        // Take a screenshot of the Electron window
        const screenshotPath = 'C:\\Users\\ohmyg\\.gemini\\antigravity\\brain\\43ac1564-adda-4c0a-b9c6-619ba36e0ace\\electron_screenshot.png';
        await mainPage.screenshot({ path: screenshotPath });
        console.log('Electron screenshot saved to:', screenshotPath);

    } catch (err) {
        console.error('Verification failed:', err);
    } finally {
        if (browser) {
            await browser.disconnect();
        }
        process.exit(0);
    }
})();
