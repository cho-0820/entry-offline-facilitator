const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\ohmyg\\.gemini\\antigravity\\brain\\43ac1564-adda-4c0a-b9c6-619ba36e0ace';

// Parse .env.local for Supabase credentials for verification & cleanup
const envPath = path.resolve(__dirname, '../../facilitator-api/.env.local');
const envLines = fs.readFileSync(envPath, 'utf-8').split('\n');
const env = {};
for (const line of envLines) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
}

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

        // Capture web console & network requests
        page.on('console', msg => {
            const text = msg.text();
            if (text.includes('[WebSave]') || text.includes('[WebLoad]')) {
                console.log(`[Browser Console] ${text}`);
            }
        });

        console.log('\n--- Step 4a: Login with S3-1-01 ---');
        await page.goto('http://localhost:3000/src/main/views/main.html', { waitUntil: 'domcontentloaded' });
        await wait(3000);

        await page.waitForSelector('input', { timeout: 5000 });
        await page.type('input', 'S3-1-01');
        await page.click('button[type="submit"]');
        await wait(3000);

        // Close mode select modal if open
        try {
            await page.waitForSelector('div.workspaceModeSelectCloseBtn', { timeout: 3000 });
            await page.click('div.workspaceModeSelectCloseBtn');
            await wait(2000);
        } catch (_) {}

        console.log('--- Step 4a: Workspace loaded, saving project ---');
        await screenshot(page, 'web_save_1_before.png');

        // Execute save via Entry.exportProject or clicking Save button in header
        console.log('Triggering project save...');
        await page.evaluate(async () => {
            const project = Entry.exportProject();
            project.name = '테스트_자동저장_작품';
            // Save via IpcRendererHelper
            await window.IpcRendererHelper.saveProject(project);
        });
        await wait(3000);
        await screenshot(page, 'web_save_2_saved.png');

        // Query Supabase directly to verify DB row and project_data
        console.log('\n--- Step 4d: Query Supabase DB for project_data ---');
        const dbRes = await fetch(
            `${env.SUPABASE_URL}/rest/v1/projects?select=*`,
            {
                headers: {
                    'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                    'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
                },
            }
        );
        const rows = await dbRes.json();
        console.log(`Total projects in DB: ${rows.length}`);
        const savedRow = rows.find(r => r.project_name === '테스트_자동저장_작품');
        if (savedRow) {
            console.log('✅ Found saved project in Supabase DB:');
            console.log('Row ID:', savedRow.id);
            console.log('Project Name:', savedRow.project_name);
            console.log('Updated At:', savedRow.updated_at);
            console.log('project_data raw snippet (first 300 chars):');
            console.log(JSON.stringify(savedRow.project_data).slice(0, 300));
        } else {
            console.error('❌ Project not found in Supabase DB!');
        }

        // Step 4b & 4c: Refresh page & verify automatic reload
        console.log('\n--- Step 4b & 4c: Refresh page & verify auto reload ---');
        await page.goto('http://localhost:3000/src/main/views/main.html', { waitUntil: 'domcontentloaded' });
        await wait(5000);

        // Close mode select modal if open
        try {
            await page.waitForSelector('div.workspaceModeSelectCloseBtn', { timeout: 3000 });
            await page.click('div.workspaceModeSelectCloseBtn');
            await wait(2000);
        } catch (_) {}

        await screenshot(page, 'web_save_3_reloaded.png');

        const loadedProjectName = await page.evaluate(() => {
            const state = window.store ? window.store.getState() : null;
            return (state && state.common && state.common.projectName) || (Entry.exportProject() && Entry.exportProject().name);
        });
        console.log(`Loaded Project Name in Workspace after refresh: "${loadedProjectName}"`);
        console.log('Auto-reload success?', loadedProjectName === '테스트_자동저장_작품' ? 'YES ✅' : 'NO ❌');

        // Step 6: Clean up test row from DB
        if (savedRow) {
            console.log('\n--- Step 6: Cleanup test data from DB ---');
            const delRes = await fetch(
                `${env.SUPABASE_URL}/rest/v1/projects?id=eq.${savedRow.id}`,
                {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
                    },
                }
            );
            console.log('Cleanup status:', delRes.status, delRes.status === 204 ? '✅ deleted' : '');
        }

    } catch (err) {
        console.error('Test error:', err);
    } finally {
        if (browser) await browser.close();
        process.exit(0);
    }
})();
