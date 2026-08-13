const puppeteer = require('puppeteer-core');

const ARTIFACT_DIR = 'C:\\Users\\ohmyg\\.gemini\\antigravity\\brain\\43ac1564-adda-4c0a-b9c6-619ba36e0ace';

async function screenshot(page, name) {
    const p = `${ARTIFACT_DIR}\\${name}`;
    await page.screenshot({ path: p });
    console.log(`Screenshot saved: ${p}`);
}

async function wait(ms) {
    return new Promise(r => setTimeout(r, ms));
}

(async () => {
    let browser;
    try {
        browser = await puppeteer.launch({
            executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });

        // Intercept verify API calls: redirect production URL to local Next.js server (port 3001)
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const url = req.url();
            if (url.includes('facilitator-api.vercel.app/api/students/verify')) {
                const localUrl = url.replace('https://facilitator-api.vercel.app', 'http://localhost:3001');
                console.log(`[Intercept] Redirecting: ${url} → ${localUrl}`);
                req.continue({ url: localUrl });
            } else {
                req.continue();
            }
        });

        // ----- Test a: Login page appears on first visit -----
        console.log('\n[Test a] First visit → login modal');
        await page.goto('http://localhost:3000/src/main/views/main.html', { waitUntil: 'domcontentloaded' });
        await wait(5000);  // Wait for React to boot
        await screenshot(page, 'login_a_initial.png');

        // Collect browser console for diagnostics
        const consoleLogs = [];
        page.on('console', msg => consoleLogs.push(msg.text()));

        // ----- Test b: Wrong code → error message -----
        console.log('\n[Test b] Wrong code → error message');
        await page.waitForSelector('input', { timeout: 5000 });
        await page.type('input', 'WRONG-CODE');
        await page.click('button[type="submit"]');
        await wait(3000);
        await screenshot(page, 'login_b_wrong_code.png');

        // ----- Test c: Correct code → login success → mode select -----
        console.log('\n[Test c] Correct code → success → mode select');
        await page.evaluate(() => {
            const input = document.querySelector('input');
            if (input) {
                const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                setter.call(input, '');
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
        await page.type('input', 'S3-1-01');
        await page.click('button[type="submit"]');
        await wait(4000);
        await screenshot(page, 'login_c_success_mode_select.png');

        // ----- Test d: Refresh → sessionStorage still set → skip login -----
        console.log('\n[Test d] Refresh → sessionStorage → no login modal');
        await page.goto('http://localhost:3000/src/main/views/main.html', { waitUntil: 'domcontentloaded' });
        await wait(3000);
        await screenshot(page, 'login_d_after_refresh.png');

        const student_code = await page.evaluate(() => sessionStorage.getItem('student_code'));
        const nickname = await page.evaluate(() => sessionStorage.getItem('nickname'));
        console.log(`sessionStorage after reload: student_code=${student_code}, nickname=${nickname}`);

        // Dismiss mode modal if visible and wait for workspace  
        try {
            await page.waitForSelector('div.workspaceModeSelectCloseBtn', { timeout: 3000 });
            await page.click('div.workspaceModeSelectCloseBtn');
            await wait(3000);
            await screenshot(page, 'login_d_workspace.png');
        } catch(_) {
            console.log('Mode modal already closed or skipped.');
        }

        console.log('\n✅ All test scenarios captured. Check screenshot files.');

    } catch (err) {
        console.error('Test crash:', err);
    } finally {
        if (browser) await browser.close();
        process.exit(0);
    }
})();
