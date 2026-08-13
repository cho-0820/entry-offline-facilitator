// Create Supabase storage bucket using native fetch + fs (no dotenv dependency)
const fs = require('fs');
const path = require('path');

// Manually parse .env.local
const envPath = path.resolve(__dirname, '../../facilitator-api/.env.local');
const envLines = fs.readFileSync(envPath, 'utf-8').split('\n');
const env = {};
for (const line of envLines) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
}

const SUPABASE_URL = env['SUPABASE_URL'];
const SERVICE_KEY  = env['SUPABASE_SERVICE_ROLE_KEY'];
const BUCKET       = 'project-assets';

console.log('SUPABASE_URL:', SUPABASE_URL ? SUPABASE_URL.slice(0, 40) + '...' : 'MISSING');
console.log('SERVICE_KEY:', SERVICE_KEY ? SERVICE_KEY.slice(0, 20) + '...' : 'MISSING');

(async () => {
    // 1. Check if bucket already exists
    const listRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
        headers: {
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'apikey': SERVICE_KEY,
        },
    });
    const buckets = await listRes.json();
    const existing = Array.isArray(buckets) && buckets.find(b => b.name === BUCKET);
    if (existing) {
        console.log(`Bucket '${BUCKET}' already exists (public: ${existing.public}).`);
        return;
    }

    // 2. Create bucket
    const createRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'apikey': SERVICE_KEY,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }),
    });
    const result = await createRes.json();
    if (createRes.ok) {
        console.log(`✅ Bucket '${BUCKET}' created (private).`);
        console.log('Response:', JSON.stringify(result, null, 2));
    } else {
        console.error('❌ Failed:', JSON.stringify(result, null, 2));
        process.exit(1);
    }
})();
