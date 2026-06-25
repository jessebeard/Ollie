import { it, describe, expect } from '../utils/test-runner.js';
import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { VaultView } from '../../app/components/vault/components/vault-view.js';

describe('VaultView URL Handling', () => {
    it('Should block javascript urls in sanitizeUrl', async () => {
        const view = new VaultView(null, null);

        await assertProperty(
            [Arbitrary.string(1, 50)],
            (str) => {
                const clean = view.sanitizeUrl(`javascript:${str}`);
                const clean2 = view.sanitizeUrl(`data:${str}`);
                const clean3 = view.sanitizeUrl(`vbscript:${str}`);
                return clean === '' && clean2 === '' && clean3 === '';
            }
        );
        expect(view.sanitizeUrl('javascript:alert(1)')).toBe('');
        expect(view.sanitizeUrl(' javascript:alert(1)')).toBe('');
        expect(view.sanitizeUrl('https://google.com')).toBe('https://google.com');
    });
});
