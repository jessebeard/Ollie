import { describe, it, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import * as fs from 'fs';
import * as path from 'path';

const isNode = typeof process !== 'undefined' && process.release.name === 'node';

describe('Vault URL Security', () => {
    it('should correctly block malicious URLs in vault-view.js launch', async () => {
        if (!isNode) return;
        const code = fs.readFileSync(path.join(process.cwd(), 'app/components/vault/components/vault-view.js'), 'utf-8');

        const match = code.match(/launchUrl\(url\)\s*{([\s\S]+?)}\s+getIcon/);
        if (!match) throw new Error("launchUrl not found in VaultView");

        let openedUrl = null;
        global.window = { open: (url) => { openedUrl = url; } };
        global.console = { error: () => {} };
        const launchUrlFn = new Function('url', match[1]);

        // Valid URLs should open
        openedUrl = null;
        launchUrlFn('https://example.com');
        expect(openedUrl).toBe('https://example.com');

        openedUrl = null;
        launchUrlFn('example.com');
        expect(openedUrl).toBe('example.com');

        // Invalid URLs should be blocked
        openedUrl = null;
        launchUrlFn('javascript:alert(1)');
        expect(openedUrl).toBe(null);

        openedUrl = null;
        launchUrlFn('data:text/html,<script>alert(1)</script>');
        expect(openedUrl).toBe(null);

        // Advanced bypass attempts
        await assertProperty(
            [Arbitrary.string(1, 50)],
            async (fuzz) => {
                openedUrl = null;
                const payload = `${fuzz}javascript:alert(1)`;
                launchUrlFn(payload);
                // If it opened a javascript: url, it failed
                if (openedUrl && openedUrl.toLowerCase().includes('javascript:')) {
                    try {
                        const parsed = new URL(openedUrl, 'http://dummy.base');
                        if (parsed.protocol.toLowerCase() === 'javascript:') {
                            return false;
                        }
                    } catch (e) {
                        // ignore
                    }
                }
                return true;
            }
        );
    });
});
