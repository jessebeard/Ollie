import { describe, it, expect } from '../utils/test-runner.js';
import * as http from 'http';
import * as child_process from 'child_process';

describe('Dev Server Security', () => {
    it('should block directory traversal attacks', async () => {
        // Start server in background
        const serverProc = child_process.spawn('node', ['scripts/dev-server.js', '9091']);

        await new Promise(resolve => setTimeout(resolve, 1000)); // wait for server start

        const testPath = async (p) => {
            return new Promise((resolve) => {
                http.get(`http://localhost:9091${p}`, (res) => {
                    resolve(res.statusCode);
                }).on('error', (e) => {
                    resolve(500); // Or handle connection error
                });
            });
        };

        try {
            const statusTravers = await testPath('/..%2f..%2f..%2f..%2fetc%2fpasswd');
            expect(statusTravers).toBe(403);

            const statusOk = await testPath('/app/index.html');
            expect(statusOk).toBe(200);
        } finally {
            serverProc.kill();
        }
    });
});
