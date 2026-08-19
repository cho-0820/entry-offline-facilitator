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

        // ──────────────────────────────────────────────
        // NO request interception — pure Vercel production
        // ──────────────────────────────────────────────
        const requestedUrls = [];
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const url = req.url();
            if (url.includes('students/verify')) {
                requestedUrls.push(url);
                console.log(`[Network] students/verify hit: ${url}`);
            }
            req.continue();  // always pass through – no redirect
        });

        console.log('\n[Test] First visit → Vercel production login');
        await page.goto('http://localhost:3000/src/main/views/main.html', { waitUntil: 'domcontentloaded' });
        await wait(5000);
        await screenshot(page, 'vercel_prod_a_login_modal.png');

        // Enter CORRECT code → should hit Vercel
        await page.waitForSelector('input', { timeout: 5000 });
        await page.type('input', 'S3-1-01');
        await page.click('button[type="submit"]');
        await wait(5000);
        await screenshot(page, 'vercel_prod_b_success.png');

        const studentCode = await page.evaluate(() => sessionStorage.getItem('student_code'));
        const nickname = await page.evaluate(() => sessionStorage.getItem('nickname'));
        const classroomName = await page.evaluate(() => sessionStorage.getItem('classroom_name'));

        console.log('\n=== RESULTS ===');
        console.log('API URL used:', requestedUrls[0] || '(none captured)');
        console.log('sessionStorage.student_code:', studentCode);
        console.log('sessionStorage.nickname:', nickname);
        console.log('sessionStorage.classroom_name:', classroomName);
        console.log('Login success?', studentCode === 'S3-1-01' ? 'YES ✅' : 'NO ❌');
        const usedVercel = requestedUrls[0] && requestedUrls[0].includes('facilitator-api.vercel.app');
        console.log('Used Vercel production URL?', usedVercel ? 'YES ✅' : 'NO ❌');

    } catch (err) {
        console.error('Test crash:', err);
    } finally {
        if (browser) await browser.close();
        process.exit(0);
    }
})();
