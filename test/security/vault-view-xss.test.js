import { it, describe, expect, getStats } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import * as fs from 'fs';
import * as path from 'path';

const isNode = typeof process !== 'undefined' && process.release.name === 'node';

describe('VaultView URL Sanitization (Security)', () => {
    it('Property: should reject dangerous URL protocols', async () => {
        let sanitizeUrlFn;
        if (isNode) {
            const code = fs.readFileSync(path.join(process.cwd(), 'app/components/vault/components/vault-view.js'), 'utf-8');
            const match = code.match(/sanitizeUrl\(url\)\s*{([\s\S]*?)}[\s]*getIcon/);
            if (!match) throw new Error("sanitizeUrl not found");
            sanitizeUrlFn = new Function('url', match[1]);
        } else {
            return;
        }

        await assertProperty(
            [Arbitrary.string(1, 100)],
            (url) => {
                const sanitized = sanitizeUrlFn(url);
                const cleanUrl = String(sanitized).replace(/[\x00-\x20\x7F]/g, '');
                try {
                    const parsed = new URL(cleanUrl, 'http://dummy.base');
                    const protocol = parsed.protocol.toLowerCase();
                    return !['javascript:', 'data:', 'vbscript:'].includes(protocol);
                } catch (e) {
                    return sanitized === 'about:blank' || sanitized === '';
                }
            }
        );

        expect(sanitizeUrlFn('javascript:alert(1)')).toBe('about:blank');
        expect(sanitizeUrlFn('  javascript:alert(1)')).toBe('about:blank');
        expect(sanitizeUrlFn('j a v a s c r i p t : alert(1)')).toBe('about:blank');
        expect(sanitizeUrlFn('\x00javascript:alert(1)')).toBe('about:blank');
        expect(sanitizeUrlFn('https://example.com/foo bar')).toBe('https://example.com/foo bar');
    });
});

const stats = getStats();
if (stats && stats.failed > 0) process.exit(1);
