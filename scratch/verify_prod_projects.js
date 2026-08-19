/**
 * Step 8: Vercel production verification for /api/projects
 * No local server — hits facilitator-api.vercel.app directly
 */
const BASE = 'https://facilitator-api.vercel.app';
const STUDENT_CODE = 'S3-1-01';
const PROJECT_NAME = '__prod_verify_dummy__';

async function api(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE}${path}`, opts);
    const data = await res.json();
    return { status: res.status, data };
}

(async () => {
    console.log('=== Vercel Production /api/projects verification ===');
    console.log('Base URL:', BASE, '\n');

    // 1. POST (create)
    console.log('--- POST /api/projects (create) ---');
    const t1 = await api('POST', '/api/projects', {
        student_code: STUDENT_CODE,
        project_name: PROJECT_NAME,
        project_data: { _test: true, scene: '장면 1', objects: ['엔트리봇'] },
    });
    console.log('Status:', t1.status);
    console.log('Body:', JSON.stringify(t1.data, null, 2));
    const projectId = t1.data?.project?.id;

    // 2. GET (list)
    console.log('\n--- GET /api/projects?student_code=S3-1-01 ---');
    const t2 = await api('GET', `/api/projects?student_code=${STUDENT_CODE}`);
    console.log('Status:', t2.status);
    console.log('Body:', JSON.stringify(t2.data, null, 2));
    const found = t2.data?.projects?.some(p => p.project_name === PROJECT_NAME);
    console.log('Project in list?', found ? 'YES ✅' : 'NO ❌');

    // 3. Cleanup via Supabase REST
    const fs = require('fs'), path = require('path');
    const envPath = path.resolve(__dirname, '../../facilitator-api/.env.local');
    const env = {};
    for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (m) env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
    }
    console.log('\n--- Cleanup: DELETE dummy project ---');
    const del = await fetch(
        `${env.SUPABASE_URL}/rest/v1/projects?id=eq.${projectId}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: env.SUPABASE_SERVICE_ROLE_KEY, Prefer: 'return=minimal' } }
    );
    console.log('Delete status:', del.status, del.status === 204 ? '✅ deleted' : '❌');

    console.log('\n=== Summary ===');
    console.log('API URL: https://facilitator-api.vercel.app/api/projects');
    console.log('POST (create):', t1.status === 200 ? 'PASS ✅' : 'FAIL ❌');
    console.log('GET  (list):  ', t2.status === 200 && found ? 'PASS ✅' : 'FAIL ❌');
    console.log('Cleanup:      ', del.status === 204 ? 'PASS ✅' : 'FAIL ❌');
})();
