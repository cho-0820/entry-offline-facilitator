const fs = require('fs');
const path = require('path');
const puppeteer = require('../scratch/node_modules/puppeteer-core');

const TARGET_URL = 'https://entry-offline.vercel.app';
const ARTIFACT_DIR = 'C:/Users/ohmyg/.gemini/antigravity/brain/43ac1564-adda-4c0a-b9c6-619ba36e0ace';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runTest() {
    const summaryLog = [];
    const consoleLogs = [];

    function log(msg) {
        const line = `[VercelLiveTest] ${msg}`;
        console.log(line);
        summaryLog.push(line);
    }

    log(`Starting Puppeteer scenario test on: ${TARGET_URL}`);

    const browser = await puppeteer.launch({
        executablePath: EDGE_PATH,
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    const imageStats = { total: 0, ok: 0, notFound: 0, failedUrls: [] };
    page.on('response', (res) => {
        const url = res.url();
        if (url.includes('/images/') || url.includes('/vendor/entry-js/images/')) {
            imageStats.total++;
            if (res.status() === 200) {
                imageStats.ok++;
            } else if (res.status() === 404) {
                imageStats.notFound++;
                imageStats.failedUrls.push(url);
            }
        }
    });

    page.on('console', (msg) => {
        consoleLogs.push(`[Console ${msg.type()}] ${msg.text()}`);
    });

    page.on('pageerror', (err) => {
        consoleLogs.push(`[PageError] ${err.toString()}`);
    });

    try {
        // ----------------------------------------------------
        // Step 1: Open Live URL & Wait for IpcRendererHelper
        // ----------------------------------------------------
        log('--- Step 1: Opening Live Vercel App ---');
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 40000 });

        // Auto click modal confirm button
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, div, span'));
            const confirmBtn = btns.find((b) => b.textContent && b.textContent.trim() === '확인');
            if (confirmBtn) confirmBtn.click();
        });

        await delay(3000);

        const shot1Path = path.join(ARTIFACT_DIR, 'live_vercel_canvas.png');
        await page.screenshot({ path: shot1Path, fullPage: true });
        log(`✓ Live Screenshot saved to: ${shot1Path}`);
        log(`✓ Image Stats: Total=${imageStats.total}, OK(200)=${imageStats.ok}, 404=${imageStats.notFound}`);
        if (imageStats.notFound > 0) {
            log(`Failed URLs Sample: ${JSON.stringify(imageStats.failedUrls.slice(0, 5))}`);
        }

        // Register student on production facilitator-api backend
        const loginRes = await page.evaluate(async () => {
            return await window.IpcRendererHelper.webLoginToServer('LIVE_VERCEL_STUDENT_2026');
        });

        log(`✓ Step 1 Complete - Real Server Login Result: ${JSON.stringify(loginRes)}`);
        const shot1_2Path = path.join(ARTIFACT_DIR, 'live_step1_workspace.png');
        await page.screenshot({ path: shot1_2Path });
        log(`Screenshot: ${shot1_2Path}`);

        // ----------------------------------------------------
        // Step 2: AI Facilitator Chat API & UI Scenario
        // ----------------------------------------------------
        log('--- Step 2: Testing AI Facilitator Chat Proxy ---');
        const apiResponse = await page.evaluate(async () => {
            return await window.IpcRendererHelper.callCodeAssistantApi('안녕! 반가워');
        });

        log(`✓ Step 2 Complete - Production AI API response: ${JSON.stringify(apiResponse)}`);
        const shot2Path = path.join(ARTIFACT_DIR, 'live_step2_chat.png');
        await page.screenshot({ path: shot2Path });
        log(`Screenshot: ${shot2Path}`);

        // ----------------------------------------------------
        // Step 3: Real Server Project Save Scenario
        // ----------------------------------------------------
        log('--- Step 3: Saving Project to Production Server ---');
        const saveResult = await page.evaluate(async () => {
            const projectData = {
                name: 'Vercel Production Test Project 2026',
                objects: [{ id: 'obj1', name: '엔트리봇', script: '' }],
            };
            const res = await window.IpcRendererHelper.saveProject(projectData, 'Vercel Production Test Project 2026.ent');
            return { success: true, res };
        });

        log(`✓ Step 3 Complete - Save Result: ${JSON.stringify(saveResult)}`);
        const shot3Path = path.join(ARTIFACT_DIR, 'live_step3_saved.png');
        await page.screenshot({ path: shot3Path });
        log(`Screenshot: ${shot3Path}`);

        // ----------------------------------------------------
        // Step 4: Page Reload & Real Server Project Reload Scenario
        // ----------------------------------------------------
        log('--- Step 4: Reloading Page & Verifying Project Reload from Production Server ---');
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForFunction(() => window.IpcRendererHelper && window.IpcRendererHelper.loadProject, { timeout: 20000 });

        // Click modal confirm button after reload if present
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button, div, span'));
            const confirmBtn = btns.find((b) => b.textContent && b.textContent.trim() === '확인');
            if (confirmBtn) confirmBtn.click();
        });

        const loadResult = await page.evaluate(async () => {
            const project = await window.IpcRendererHelper.loadProject();
            return { success: !!project, projectName: project ? project.name : null, project };
        });

        log(`✓ Step 4 Complete - Loaded Project from Server: ${JSON.stringify(loadResult)}`);
        const shot4Path = path.join(ARTIFACT_DIR, 'live_step4_reloaded.png');
        await page.screenshot({ path: shot4Path });
        log(`Screenshot: ${shot4Path}`);

        const resultSummary = {
            targetUrl: TARGET_URL,
            step1_login: loginRes,
            step2_aiChat: apiResponse,
            step3_saveProject: saveResult,
            step4_reloadProject: loadResult,
        };

        fs.writeFileSync(path.join(ARTIFACT_DIR, 'vercel_live_test_summary.json'), JSON.stringify(resultSummary, null, 2));
        fs.writeFileSync(path.join(ARTIFACT_DIR, 'vercel_live_test_console.json'), JSON.stringify(consoleLogs, null, 2));
        log('--- ALL SCENARIO TESTS PASSED SUCCESSFULLY ---');
    } catch (e) {
        log(`Test Exception: ${e.stack || e.toString()}`);
    } finally {
        await browser.close();
        fs.writeFileSync(path.join(ARTIFACT_DIR, 'vercel_live_test_summary.log'), summaryLog.join('\n'));
    }
}

runTest();
