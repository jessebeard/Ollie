import { describe, it, expect } from '../utils/test-runner.js';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

describe('Security: Path Traversal in dev-server', () => {
    it('should reject requests attempting to escape ROOT directory', async () => {
        return new Promise((resolve, reject) => {
            const serverProcess = spawn('node', ['scripts/dev-server.js', '8082'], { cwd: ROOT });

            // Wait for server to output ready message
            serverProcess.stdout.on('data', (data) => {
                if (data.toString().includes('Ollie dev server running')) {
                    const options = {
                        hostname: 'localhost',
                        port: 8082,
                        path: '/../../etc/passwd',
                        method: 'GET',
                    };

                    const req = http.request(options, (res) => {
                        serverProcess.kill();
                        if (res.statusCode === 403 || res.statusCode === 404) {
                            expect(res.statusCode === 403 || res.statusCode === 404).toBe(true);
                            resolve();
                        } else {
                            reject(new Error(`Vulnerable: Server returned status ${res.statusCode} for traversal request`));
                        }
                    });

                    req.on('error', (err) => {
                        serverProcess.kill();
                        reject(err);
                    });

                    req.end();
                }
            });

            serverProcess.stderr.on('data', (data) => {
                serverProcess.kill();
                reject(new Error(`Server error: ${data}`));
            });
        });
    });
});
