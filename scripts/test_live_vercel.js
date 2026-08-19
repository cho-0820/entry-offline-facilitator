const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const TARGET_URL = 'https://distweb-theta.vercel.app';
const ARTIFACT_DIR = 'C:\\Users\\ohmyg\\.gemini\\antigravity\\brain\\43ac1564-adda-4c0a-b9c6-619ba36e0ace';

function findChrome() {
    const paths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) return p;
    }
    throw new Error('Chrome executable not found!');
}

async function runTest() {
    console.log('[VercelCleanTest] Starting live site validation on:', TARGET_URL);
    const executablePath = findChrome();
    const browser = await puppeteer.launch({
        executablePath,
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    const consoleErrors = [];
    const consoleLogs = [];
    const failedRequests = [];

    page.on('console', msg => {
        const text = msg.text();
        const type = msg.type();
        if (type === 'error') {
            consoleErrors.push(text);
        } else {
            consoleLogs.push(`[${type}] ${text}`);
        }
    });

    page.on('pageerror', err => {
        consoleErrors.push(err.toString());
    });

    page.on('response', res => {
        if (res.status() >= 400) {
            failedRequests.push({ url: res.url(), status: res.status() });
        }
    });

    try {
        console.log('[VercelCleanTest] Navigating to target site...');
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });
        await new Promise(r => setTimeout(r, 4000));

        const loginModalShot = path.join(ARTIFACT_DIR, 'vercel_clean_login_modal.png');
        await page.screenshot({ path: loginModalShot, fullPage: true });
        console.log(`[VercelCleanTest] ✓ Clean Login Modal Screenshot saved: ${loginModalShot}`);

        console.log(`[VercelCleanTest] Console Errors Count: ${consoleErrors.length}`);
        if (consoleErrors.length > 0) {
            console.log('[VercelCleanTest] Console Errors Detail:', consoleErrors);
        } else {
            console.log('[VercelCleanTest] ✓ CONSOLE IS COMPLETELY CLEAN (0 ERRORS)!');
        }

        console.log(`[VercelCleanTest] Failed Requests Count: ${failedRequests.length}`);
        if (failedRequests.length > 0) {
            console.log('[VercelCleanTest] Failed Requests Detail:', failedRequests);
        } else {
            console.log('[VercelCleanTest] ✓ ALL NETWORK REQUESTS RETURNED 200 OK (0 FAILURES)!');
        }

    } catch (e) {
        console.error('[VercelCleanTest] Test Exception:', e);
    } finally {
        await browser.close();
    }
}

runTest();
