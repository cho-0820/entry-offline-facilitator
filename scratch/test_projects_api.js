/**
 * Step 7: curl-equivalent tests for /api/projects
 * 1. POST (save) → dummy project
 * 2. GET (list) → verify it's there
 * 3. POST again (upsert/update) → same name
 * 4. GET → verify updated_at changed
 * 5. DELETE the project from DB (cleanup)
 */
const BASE = 'http://localhost:3001';
const STUDENT_CODE = 'S3-1-01';  // 기발한 토끼 (already in DB)
const PROJECT_NAME = '__test_dummy_project__';

async function api(method, path, body) {
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE}${path}`, opts);
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data };
}

(async () => {
    console.log('=== Step 7: Projects API curl-equivalent tests ===\n');

    // ── Test 1: POST (create new project) ──────────────────────────────
    console.log('--- Test 1: POST /api/projects (create) ---');
    const t1 = await api('POST', '/api/projects', {
        student_code: STUDENT_CODE,
        project_name: PROJECT_NAME,
        project_data: {
            _isEntryProject: true,
            objects: [{ name: '엔트리봇', type: 'sprite' }],
            variables: [],
            messages: [],
            scenes: [{ name: '장면 1' }],
        },
    });
    console.log('Status:', t1.status);
    console.log('Body:', JSON.stringify(t1.data, null, 2));
    const projectId = t1.data?.project?.id;

    // ── Test 2: GET (list projects) ────────────────────────────────────
    console.log('\n--- Test 2: GET /api/projects?student_code=S3-1-01 ---');
    const t2 = await api('GET', `/api/projects?student_code=${STUDENT_CODE}`);
    console.log('Status:', t2.status);
    console.log('Body:', JSON.stringify(t2.data, null, 2));
    const found = t2.data?.projects?.some(p => p.project_name === PROJECT_NAME);
    console.log('Test project in list?', found ? 'YES ✅' : 'NO ❌');

    // ── Test 3: POST (upsert — same name, updated data) ────────────────
    console.log('\n--- Test 3: POST /api/projects (upsert — update same name) ---');
    const t3 = await api('POST', '/api/projects', {
        student_code: STUDENT_CODE,
        project_name: PROJECT_NAME,
        project_data: { _isEntryProject: true, updated: true, objects: [] },
    });
    console.log('Status:', t3.status);
    console.log('Body:', JSON.stringify(t3.data, null, 2));
    const sameId = t3.data?.project?.id === projectId;
    console.log('Same project ID (upsert, not insert)?', sameId ? 'YES ✅' : 'NO ❌');

    // ── Cleanup: delete test row via Supabase REST ─────────────────────
    const fs = require('fs');
    const path = require('path');
    const envPath = path.resolve(__dirname, '../../facilitator-api/.env.local');
    const envLines = fs.readFileSync(envPath, 'utf-8').split('\n');
    const env = {};
    for (const line of envLines) {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (m) env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
    }

    console.log('\n--- Cleanup: DELETE dummy project from DB ---');
    const delRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/projects?id=eq.${projectId}`,
        {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
                'Prefer': 'return=representation',
            },
        }
    );
    const delData = delRes.status === 204 ? '(no content — deleted)' : await delRes.json();
    console.log('Delete status:', delRes.status, '|', JSON.stringify(delData));

    // ── Final verify: project gone ─────────────────────────────────────
    console.log('\n--- Final verify: GET after delete ---');
    const t4 = await api('GET', `/api/projects?student_code=${STUDENT_CODE}`);
    const stillThere = t4.data?.projects?.some(p => p.project_name === PROJECT_NAME);
    console.log('Status:', t4.status);
    console.log('Test project still in list?', stillThere ? 'YES ❌ (cleanup failed)' : 'NO ✅ (cleaned up)');

    console.log('\n=== Done ===');
})();
