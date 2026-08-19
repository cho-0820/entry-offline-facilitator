const fs = require('fs');
const path = require('path');
const puppeteer = require('../scratch/node_modules/puppeteer-core');

const TARGET_URL = 'https://distweb-theta.vercel.app';
const ARTIFACT_DIR = 'C:/Users/ohmyg/.gemini/antigravity/brain/43ac1564-adda-4c0a-b9c6-619ba36e0ace';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function test() {
    const failed404s = [];
    const allRequests = [];

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
        allRequests.push({ url, status });
        if (status >= 400) {
            failed404s.push({ url, status });
        }
    });

    try {
        console.log(`Opening ${TARGET_URL}...`);
        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise((r) => setTimeout(r, 3000));

        // Click mode modal confirm button
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, div, span'));
            const confirmBtn = btns.find((b) => b.textContent && b.textContent.trim() === '확인');
            if (confirmBtn) confirmBtn.click();
        });

        await new Promise((r) => setTimeout(r, 5000));

        // Get Entry media paths and block image URLs from DOM
        const entryPaths = await page.evaluate(() => {
            return {
                mediaFilePath: window.Entry ? window.Entry.mediaFilePath : null,
                mediaURL: window.Entry ? window.Entry.mediaURL : null,
                mediaURL_: window.Entry ? window.Entry.mediaURL_ : null,
            };
        });

        // Find all SVG image elements, canvas images, and CSS background images
        const brokenImages = await page.evaluate(() => {
            const imgs = Array.from(document.querySelectorAll('img, image, use'));
            return imgs.map((el) => {
                const src = el.src || el.getAttribute('href') || el.getAttribute('xlink:href') || '';
                return {
                    tagName: el.tagName,
                    src,
                    width: el.width ? el.width.baseVal ? el.width.baseVal.value : el.width : null,
                    height: el.height ? el.height.baseVal ? el.height.baseVal.value : el.height : null,
                    className: el.getAttribute('class') || '',
                };
            });
        });

        const report = {
            entryPaths,
            failed404sCount: failed404s.length,
            failed404s,
            brokenImages,
        };

        fs.writeFileSync(path.join(ARTIFACT_DIR, 'image_test_results.json'), JSON.stringify(report, null, 2));
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'live_workspace_images.png') });
        console.log('Test completed!');
    } catch (e) {
        console.error('Test error:', e);
    } finally {
        await browser.close();
    }
}

test();
