(async () => {
    const urls = [
        'https://facilitator-api.vercel.app/api/students/verify',
        'https://facilitator-fxwqbhpv5-cho14.vercel.app/api/students/verify',
    ];

    for (const url of urls) {
        console.log(`\n--- Testing: ${url} ---`);
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ student_code: 'S3-1-01' })
            });
            console.log('HTTP Status:', res.status);
            const ct = res.headers.get('content-type') || '';
            if (ct.includes('json')) {
                const data = await res.json();
                console.log('Body:', JSON.stringify(data, null, 2));
            } else {
                const text = await res.text();
                console.log('Body (non-JSON, first 300):', text.slice(0, 300));
            }
        } catch(e) {
            console.error('Error:', e.message);
        }
    }
})();
