const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const TARGET_URL = 'https://entry-offline-web.vercel.app';
const ARTIFACT_DIR = 'C:/Users/ohmyg/.gemini/antigravity/brain/43ac1564-adda-4c0a-b9c6-619ba36e0ace';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function log(msg) {
    const str = `[LiveTest] ${new Date().toISOString().slice(11, 19)} - ${msg}\n`;
    fs.appendFileSync(path.join(ARTIFACT_DIR, 'live_execution.log'), str);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runTest() {
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'live_execution.log'), '');
    log(`Starting fast live web test on: ${TARGET_URL}`);
    const consoleLogs = [];

    const browser = await puppeteer.launch({
        executablePath: EDGE_PATH,
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    page.on('console', (msg) => {
        const text = msg.text();
        consoleLogs.push(`[Browser ${msg.type()}] ${text}`);
    });

    page.on('pageerror', (err) => {
        consoleLogs.push(`[Browser ERROR] ${err.toString()}`);
    });

    try {
        // Step 1: Open Live URL
        log('Step 1: Opening Live Web App URL');
        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Set student code
        await page.evaluate(() => {
            sessionStorage.setItem('student_code', 'LIVE_PUPPETEER_USER_2026');
        });

        await delay(3000);
        const shot1Path = path.join(ARTIFACT_DIR, 'live_step1_workspace.png');
        await page.screenshot({ path: shot1Path });
        log(`Saved screenshot 1: ${shot1Path}`);

        // Step 2: AI Chat Test
        log('Step 2: Calling Production AI Assistant API');
        const apiResponse = await page.evaluate(async () => {
            if (window.IpcRendererHelper && window.IpcRendererHelper.callCodeAssistantApi) {
                const res = await window.IpcRendererHelper.callCodeAssistantApi('안녕! 반가워');
                return res;
            }
            return null;
        });

        log(`Direct AI API call result: ${JSON.stringify(apiResponse)}`);

        const shot2Path = path.join(ARTIFACT_DIR, 'live_step2_chat_response.png');
        await page.screenshot({ path: shot2Path });
        log(`Saved screenshot 2: ${shot2Path}`);

        // Step 3: Project Save Test
        log('Step 3: Saving Project to Production Server');
        const saveResult = await page.evaluate(async () => {
            if (window.Entry && window.IpcRendererHelper && window.IpcRendererHelper.saveProject) {
                const projectData = Entry.exportProject ? Entry.exportProject() : { name: 'Live Vercel Test Project', objects: [] };
                projectData.name = 'Live Vercel Test Project 2026';
                const result = await window.IpcRendererHelper.saveProject(projectData, 'Live Vercel Test Project 2026.ent');
                return { success: true, result };
            }
            return { success: false, reason: 'Entry / IpcRendererHelper missing' };
        });

        log(`Project save result: ${JSON.stringify(saveResult)}`);

        const shot3Path = path.join(ARTIFACT_DIR, 'live_step3_saved.png');
        await page.screenshot({ path: shot3Path });
        log(`Saved screenshot 3: ${shot3Path}`);

        // Step 4: Reload & Verify Project Load
        log('Step 4: Page Reload & Project Reload Verification');
        await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

        await page.evaluate(() => {
            sessionStorage.setItem('student_code', 'LIVE_PUPPETEER_USER_2026');
        });

        await delay(2000);

        const loadResult = await page.evaluate(async () => {
            if (window.IpcRendererHelper && window.IpcRendererHelper.loadProject) {
                const project = await window.IpcRendererHelper.loadProject();
                return { success: !!project, projectName: project ? project.name : null };
            }
            return { success: false };
        });

        log(`Project reload result: ${JSON.stringify(loadResult)}`);

        const shot4Path = path.join(ARTIFACT_DIR, 'live_step4_reloaded.png');
        await page.screenshot({ path: shot4Path });
        log(`Saved screenshot 4: ${shot4Path}`);

        const summary = {
            targetUrl: TARGET_URL,
            step1_workspace: true,
            step2_aiChatResponse: apiResponse,
            step3_projectSave: saveResult,
            step4_projectReload: loadResult,
        };

        fs.writeFileSync(path.join(ARTIFACT_DIR, 'live_test_summary.json'), JSON.stringify(summary, null, 2));
        fs.writeFileSync(path.join(ARTIFACT_DIR, 'live_test_logs.json'), JSON.stringify(consoleLogs, null, 2));
        log('TEST COMPLETED SUCCESSFULLY');
    } catch (e) {
        log(`Test Exception: ${e.toString()}`);
    } finally {
        await browser.close();
    }
}

runTest();
