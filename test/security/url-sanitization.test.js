import { describe, it, expect } from '../utils/test-runner.js';
import { VaultView } from '../../app/components/vault/components/vault-view.js';

describe('VaultView Security', () => {
    it('prevents malicious URLs from executing', () => {
        const eventBus = { emit: () => {} };
        const view = new VaultView(document.createElement('div'), eventBus);

        expect(view.sanitizeUrl('javascript:alert(1)')).toBe('about:blank');
        expect(view.sanitizeUrl('  jAvAsCrIpT:alert(1)')).toBe('about:blank');
        expect(view.sanitizeUrl('vbscript:alert(1)')).toBe('about:blank');
        expect(view.sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('about:blank');
        expect(view.sanitizeUrl('https://example.com')).toBe('https://example.com');
    });
});
