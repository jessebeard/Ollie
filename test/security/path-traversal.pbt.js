import { describe, it, expect } from '../utils/test-runner.js';
import path from 'path';
import { resolveSafePath } from '../../scripts/path-resolver.js';

describe('Security: Path Sanitization Property', () => {
    it('should never resolve to a path outside the ROOT directory', () => {
        const ROOT = '/app/root/dir';

        const fuzzCases = [
            '/../../etc/passwd',
            '%2e%2e%2f%2e%2e%2fetc/passwd',
            '/app/root/dir/../../../etc/passwd',
            '/app/root/dir/file.txt',
            '/%2e%2e/%2e%2e/',
            '/....//....//etc/passwd',
            '/.../..../etc/passwd'
        ];

        let vulnerable = false;
        for (const fuzz of fuzzCases) {
            let decoded = decodeURIComponent(fuzz);
            const resolved = resolveSafePath(ROOT, decoded);
            if (resolved !== null && !resolved.startsWith(ROOT + path.sep) && resolved !== ROOT) {
                vulnerable = true;
            }
        }

        expect(vulnerable).toBe(false);
    });
});
