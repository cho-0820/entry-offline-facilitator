const fetch = require('node-fetch'); // Next.js 16/Node.js 18+ uses native fetch, but let's just write pure JS with native fetch or fallbacks.

(async () => {
    try {
        console.log('Sending request to verify S3-1-01 ...');
        const res = await fetch('http://localhost:3000/api/students/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_code: 'S3-1-01' })
        });
        const data = await res.json();
        console.log('--- API RESPONSE (S3-1-01) ---');
        console.log(JSON.stringify(data, null, 2));
        console.log('------------------------------');

        console.log('Sending request to verify invalid-code ...');
        const res2 = await fetch('http://localhost:3000/api/students/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_code: 'INVALID-CODE' })
        });
        console.log('--- API RESPONSE (INVALID-CODE) Status:', res2.status);
        const data2 = await res2.json();
        console.log(JSON.stringify(data2, null, 2));
        console.log('------------------------------');

    } catch (err) {
        console.error('Fetch test failed:', err);
    }
})();
