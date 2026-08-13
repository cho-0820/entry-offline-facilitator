const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:\\Users\\ohmyg\\.gemini\\antigravity\\brain\\43ac1564-adda-4c0a-b9c6-619ba36e0ace';

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

// Extract block types & statement structure recursively (ignoring random IDs and coords)
function extractBlockStructure(block) {
    if (!block) return null;
    if (Array.isArray(block)) {
        return block.map(extractBlockStructure);
    }
    const result = { type: block.type };
    if (block.params && block.params.length > 0) {
        result.params = block.params.map(p => {
            if (p && typeof p === 'object' && p.type) return extractBlockStructure(p);
            return p;
        });
    }
    if (block.statements && block.statements.length > 0) {
        result.statements = block.statements.map(stmtGroup => 
            stmtGroup.map(extractBlockStructure)
        );
    }
    return result;
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

        page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
        page.on('pageerror', err => console.error('BROWSER PAGE ERROR:', err.message));

        console.log('\n--- Step 0: Clean pre-existing projects for S3-1-01 ---');
        const sRes = await fetch(`${env.SUPABASE_URL}/rest/v1/students?student_code=eq.S3-1-01&select=id`, {
            headers: { 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'apikey': env.SUPABASE_SERVICE_ROLE_KEY }
        });
        const sRows = await sRes.json();
        if (sRows && sRows.length > 0) {
            await fetch(`${env.SUPABASE_URL}/rest/v1/projects?student_id=eq.${sRows[0].id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'apikey': env.SUPABASE_SERVICE_ROLE_KEY }
            });
            console.log('Pre-existing projects cleaned up for student S3-1-01 ✅');
        }

        console.log('\n--- Step 1: Login with S3-1-01 ---');
        await page.goto('http://localhost:3000/src/main/views/main.html', { waitUntil: 'domcontentloaded' });
        await wait(3000);

        await page.waitForSelector('input', { timeout: 5000 });
        await page.type('input', 'S3-1-01');
        await page.click('button[type="submit"]');
        await wait(3000);

        try {
            await page.waitForSelector('div.workspaceModeSelectCloseBtn', { timeout: 3000 });
            await page.click('div.workspaceModeSelectCloseBtn');
            await wait(2000);
        } catch (_) {}

        console.log('\n--- Step 2: Inject Complex Nested Block Thread ---');
        await page.evaluate(() => {
            const targetObject = Entry.container.getAllObjects()[0];
            if (targetObject) Entry.container.selectObject(targetObject.id);

            const complexThread = [
                {
                    type: 'repeat_basic',
                    x: 50,
                    y: 200,
                    params: [{ type: 'number', params: [10] }],
                    statements: [
                        [
                            { type: 'move_direction', params: [{ type: 'number', params: [15] }] },
                            {
                                type: '_if',
                                params: [{ type: 'boolean_equal', params: [{ type: 'number', params: [5] }, { type: 'number', params: [5] }] }],
                                statements: [
                                    [{ type: 'dialog', params: [{ type: 'text', params: ['복합 블록 보존 성공!'] }, 'talk'] }]
                                ]
                            }
                        ]
                    ]
                }
            ];

            Entry.do('addThread', complexThread);
            Entry.stage.update();
        });

        await wait(1500);
        await screenshot(page, 'complex_block_1_before_save.png');

        console.log('\n--- Step 3: Save Complex Project to Web Server ---');
        const exportedData = await page.evaluate(async () => {
            const project = Entry.exportProject();
            project.name = '복합_블록_검증_작품';
            await window.IpcRendererHelper.saveProject(project);
            const obj = project.objects[0];
            const rawScript = typeof obj.script === 'string' ? JSON.parse(obj.script) : obj.script;
            return {
                objectCount: project.objects.length,
                rawScriptBefore: rawScript,
            };
        });

        const structBefore = extractBlockStructure(exportedData.rawScriptBefore);
        console.log('Exported Block Threads Structure (Saved to Web Server):');
        console.log(JSON.stringify(structBefore, null, 2));

        console.log('\n--- Step 4: Refresh Page & Auto-Load Project ---');
        await page.evaluateOnNewDocument(() => {
            sessionStorage.setItem('student_code', 'S3-1-01');
            sessionStorage.setItem('nickname', '슬기로운 코딩가');
            sessionStorage.setItem('classroom_name', '3학년 1반');
        });

        await page.goto('http://localhost:3000/src/main/views/main.html', { waitUntil: 'domcontentloaded' });
        await wait(6000);

        await screenshot(page, 'complex_block_2_after_reload.png');

        console.log('\n--- Step 5: Verify Loaded Project Block Logic Structure ---');
        const loadedInfo = await page.evaluate(() => {
            const targetObject = Entry.container.getAllObjects()[0];
            let rawScript = [];
            if (targetObject && targetObject.script && typeof targetObject.script.toJSON === 'function') {
                rawScript = targetObject.script.toJSON();
            } else if (targetObject && typeof targetObject.script === 'string') {
                rawScript = JSON.parse(targetObject.script);
            } else if (targetObject && Array.isArray(targetObject.script)) {
                rawScript = targetObject.script;
            }
            return {
                objectCount: Entry.container.getAllObjects().length,
                objectName: targetObject ? targetObject.name : null,
                rawScriptAfter: rawScript,
            };
        });

        const structAfter = extractBlockStructure(loadedInfo.rawScriptAfter);
        console.log('Reloaded Block Threads Structure (After Reload):');
        console.log(JSON.stringify(structAfter, null, 2));

        const isExactMatch = JSON.stringify(structBefore) === JSON.stringify(structAfter);

        console.log('\n=== BLOCK STRUCTURE PRESERVATION VERIFICATION ===');
        console.log('1) Object count before vs after:', exportedData.objectCount, 'vs', loadedInfo.objectCount, '(Match:', exportedData.objectCount === loadedInfo.objectCount ? 'YES ✅' : 'NO ❌', ')');
        console.log('2) All Threads (including repeat_basic + _if + dialog) exact match:', isExactMatch ? 'YES ✅' : 'NO ❌');

        // Cleanup test data from DB
        const dbRes = await fetch(`${env.SUPABASE_URL}/rest/v1/projects?project_name=eq.복합_블록_검증_작품`, {
            headers: { 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'apikey': env.SUPABASE_SERVICE_ROLE_KEY }
        });
        const rows = await dbRes.json();
        if (rows && rows.length > 0) {
            await fetch(`${env.SUPABASE_URL}/rest/v1/projects?id=eq.${rows[0].id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'apikey': env.SUPABASE_SERVICE_ROLE_KEY }
            });
            console.log('\nCleaned up test project from DB ✅');
        }

    } catch (err) {
        console.error('Test error:', err);
    } finally {
        if (browser) await browser.close();
        process.exit(0);
    }
})();
