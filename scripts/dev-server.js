/**
 * No-cache dev server for Ollie
 * Usage: node serve.js [port]
 * 
 * Serves static files with Cache-Control: no-store to prevent
 * browser caching of ES modules during development.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = parseInt(process.argv[2] || '8081', 10);

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.xml': 'application/xml',
    '.md': 'text/markdown',
};

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let reqPath = decodeURIComponent(url.pathname);

    // Default to index.html for root requests
    if (reqPath === '/') {
        reqPath = '/app/index.html';
    } else if (reqPath === '/test.html' || reqPath === '/vault.html') {
        reqPath = '/app' + reqPath;
    }

    let filePath = path.join(ROOT, reqPath);

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('500 Internal Server Error');
            }
            return;
        }

        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`\n  🚀 Ollie dev server running at http://localhost:${PORT}/`);
    console.log(`  📋 Tests:  http://localhost:${PORT}/test.html`);
    console.log(`  🔐 Vault:  http://localhost:${PORT}/vault.html`);
    console.log(`  ⚡ Cache:  DISABLED (no-store on all responses)\n`);
});
