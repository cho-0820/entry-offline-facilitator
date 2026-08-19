const fs = require('fs');
const path = require('path');
const puppeteer = require('../scratch/node_modules/puppeteer-core');

const TARGET_URL = 'https://distweb-theta.vercel.app';
const ARTIFACT_DIR = 'C:/Users/ohmyg/.gemini/antigravity/brain/43ac1564-adda-4c0a-b9c6-619ba36e0ace';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function diagnose() {
    const failed404s = [];
    const allReqs = [];

    const browser = await puppeteer.launch({
        executablePath: EDGE_PATH,
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800'],
    });

    const page = await browser.newPage();

    page.on('response', (res) => {
        const url = res.url();
        const status = res.status();
        allReqs.push({ url, status });
        if (status >= 400) {
            failed404s.push({ url, status });
        }
    });

    try {
        console.log(`Opening ${TARGET_URL}...`);
        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise((r) => setTimeout(r, 3000));

        // Click mode selection modal confirm button ('확인')
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, div, span'));
            const confirmBtn = btns.find((b) => b.textContent && b.textContent.trim() === '확인');
            if (confirmBtn) confirmBtn.click();
        });

        console.log('Clicked confirm modal, waiting 8s for workspace & Entry canvas...');
        await new Promise((r) => setTimeout(r, 8000));

        // Collect Entry media paths and all image tags
        const analysis = await page.evaluate(() => {
            const entryInfo = window.Entry ? {
                mediaFilePath: Entry.mediaFilePath,
                mediaURL: Entry.mediaURL,
                mediaURL_: Entry.mediaURL_,
                STATIC_MIN_WORK_URL: Entry.STATIC_MIN_WORK_URL,
            } : null;

            // Find all svg <image>, <use>, <img> elements
            const allImgEls = Array.from(document.querySelectorAll('img, image, use, svg *'));
            const imageElements = allImgEls.map((el) => {
                const href = el.getAttribute('href') || el.getAttribute('xlink:href') || el.src || '';
                if (href) {
                    return {
                        tagName: el.tagName,
                        href,
                        className: el.getAttribute('class') || '',
                    };
                }
                return null;
            }).filter(Boolean);

            return { entryInfo, imageElements };
        });

        const report = {
            targetUrl: TARGET_URL,
            entryInfo: analysis.entryInfo,
            failed404sCount: failed404s.length,
            failed404s,
            imageElements: analysis.imageElements,
        };

        fs.writeFileSync(path.join(ARTIFACT_DIR, 'exact_image_failures.json'), JSON.stringify(report, null, 2));
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'canvas_image_diagnosis.png') });
        console.log('Diagnosis completed!');
    } finally {
        await browser.close();
    }
}

diagnose();
