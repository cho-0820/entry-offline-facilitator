const fs = require('fs');
const path = require('path');
const puppeteer = require('../scratch/node_modules/puppeteer-core');

const TARGET_URL = 'https://distweb-theta.vercel.app';
const ARTIFACT_DIR = 'C:/Users/ohmyg/.gemini/antigravity/brain/43ac1564-adda-4c0a-b9c6-619ba36e0ace';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function diagnose() {
    const failedRequests = [];
    const consoleMsgs = [];

    const browser = await puppeteer.launch({
        executablePath: EDGE_PATH,
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    page.on('console', (msg) => {
        consoleMsgs.push(`[Console ${msg.type()}] ${msg.text()}`);
    });

    page.on('requestfailed', (req) => {
        failedRequests.push(`[404/Failed] ${req.url()} (${req.failure() ? req.failure().errorText : 'failed'})`);
    });

    page.on('response', (res) => {
        if (res.status() >= 400) {
            failedRequests.push(`[HTTP ${res.status()}] ${res.url()}`);
        }
    });

    try {
        console.log(`Diagnosing page: ${TARGET_URL}`);
        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

        await new Promise((r) => setTimeout(r, 4000));

        const html = await page.content();
        fs.writeFileSync(path.join(ARTIFACT_DIR, 'live_page_content.html'), html);

        fs.writeFileSync(path.join(ARTIFACT_DIR, 'live_failed_requests.txt'), failedRequests.join('\n'));
        fs.writeFileSync(path.join(ARTIFACT_DIR, 'live_console_msgs.txt'), consoleMsgs.join('\n'));

        console.log(`Failed requests count: ${failedRequests.length}`);
        console.log(`Console msgs count: ${consoleMsgs.length}`);
    } finally {
        await browser.close();
    }
}

diagnose();
