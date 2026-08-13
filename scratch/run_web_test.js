const puppeteer = require('puppeteer-core');
const fs = require('fs');

(async () => {
    let browser;
    try {
        console.log('Launching browser...');
        browser = await puppeteer.launch({
            headless: true,
            executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        
        page.on('console', msg => console.log('BROWSER_LOG:', msg.text()));
        page.on('pageerror', err => console.error('BROWSER_ERROR:', err.message));

        console.log('Navigating to http://localhost:3000/src/main/views/main.html ...');
        await page.goto('http://localhost:3000/src/main/views/main.html', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        console.log('Waiting for mode select close button...');
        const closeBtnSelector = 'div.workspaceModeSelectCloseBtn';
        await page.waitForSelector(closeBtnSelector, { timeout: 10000 });
        
        console.log('Clicking mode select close button...');
        await page.click(closeBtnSelector);

        console.log('Waiting for workspace to load...');
        await new Promise(resolve => setTimeout(resolve, 8000));

        console.log('Checking for chat input...');
        const inputSelector = 'input[placeholder="코드 도우미에게 질문하기..."]';
        await page.waitForSelector(inputSelector, { timeout: 5000 });

        console.log('Entering query in AI Chat Input...');
        await page.type(inputSelector, 'Make a thread to move object 10 times');

        console.log('Clicking send button...');
        const sendBtnSelector = 'input[placeholder="코드 도우미에게 질문하기..."] ~ button';
        await page.click(sendBtnSelector);

        console.log('Waiting for AI Assistant reply...');
        // Wait 25 seconds to let Gemini/Claude API response arrive
        await new Promise(resolve => setTimeout(resolve, 25000));

        console.log('Scrolling down AI chat panel...');
        await page.evaluate(() => {
            const divs = Array.from(document.querySelectorAll('div'));
            const container = divs.find(d => d.style.overflowY === 'auto');
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        });

        console.log('Taking screenshot of the workspace...');
        const screenshotPath = 'C:\\Users\\ohmyg\\.gemini\\antigravity\\brain\\43ac1564-adda-4c0a-b9c6-619ba36e0ace\\screenshot_result.png';
        await page.screenshot({ path: screenshotPath });
        console.log('Screenshot saved to:', screenshotPath);

    } catch (error) {
        console.error('Test script crashed:', error);
    } finally {
        if (browser) {
            await browser.close();
        }
        process.exit(0);
    }
})();
