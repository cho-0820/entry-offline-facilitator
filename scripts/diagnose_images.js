const fs = require('fs');
const path = require('path');
const puppeteer = require('../scratch/node_modules/puppeteer-core');

const TARGET_URL = 'https://distweb-theta.vercel.app';
const ARTIFACT_DIR = 'C:/Users/ohmyg/.gemini/antigravity/brain/43ac1564-adda-4c0a-b9c6-619ba36e0ace';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function run() {
    const failedImageReqs = [];
    const allImageReqs = [];

    const browser = await puppeteer.launch({
        executablePath: EDGE_PATH,
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    page.on('response', (res) => {
        const url = res.url();
        const status = res.status();
        const headers = res.headers();
        const contentType = headers['content-type'] || '';

        if (url.match(/\.(png|jpg|jpeg|svg|gif|webp|ico)(\?.*)?$/i) || contentType.includes('image')) {
            allImageReqs.push({ url, status, contentType });
            if (status >= 400) {
                failedImageReqs.push({ url, status, contentType });
            }
        }
    });

    try {
        console.log(`Opening ${TARGET_URL}...`);
        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise((r) => setTimeout(r, 4000));

        // Click modal confirm button if present
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, div, span'));
            const confirmBtn = btns.find((b) => b.textContent && b.textContent.trim() === '확인');
            if (confirmBtn) confirmBtn.click();
        });

        await new Promise((r) => setTimeout(r, 4000));

        // Find all img tags on DOM
        const domImages = await page.evaluate(() => {
            const imgs = Array.from(document.querySelectorAll('img'));
            return imgs.map((img) => ({
                src: img.src,
                naturalWidth: img.naturalWidth,
                naturalHeight: img.naturalHeight,
                outerHTML: img.outerHTML,
                className: img.className,
                parentElement: img.parentElement ? img.parentElement.tagName : null,
            }));
        });

        const report = {
            targetUrl: TARGET_URL,
            failedImageReqsCount: failedImageReqs.length,
            failedImageReqs,
            allImageReqsCount: allImageReqs.length,
            sampleAllImageReqs: allImageReqs.slice(0, 30),
            domImages,
        };

        fs.writeFileSync(path.join(ARTIFACT_DIR, 'image_diagnosis_report.json'), JSON.stringify(report, null, 2));
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'image_diagnosis_screen.png') });
        console.log('Image diagnosis completed!');
    } catch (e) {
        console.error('Diagnosis Error:', e);
    } finally {
        await browser.close();
    }
}

run();
