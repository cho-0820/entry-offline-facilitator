const http = require('http');
const req = http.get('http://localhost:3001/api/students/verify', (r) => {
    console.log('localhost:3001 status:', r.statusCode, '— SERVER IS STILL RUNNING!');
    process.exit(0);
});
req.on('error', (e) => {
    console.log(`localhost:3001: ${e.code} — server is DOWN (confirmed offline)`);
    process.exit(0);
});
req.setTimeout(2000, () => {
    console.log('localhost:3001 TIMEOUT');
    req.destroy();
    process.exit(0);
});
