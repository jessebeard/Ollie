import { Arbitrary, assertProperty } from '../../utils/pbt.js';
import { VaultView } from '../../../app/components/vault/components/vault-view.js';
import { it, describe, expect } from '../../utils/test-runner.js';

describe('Vault UI XSS Prevention', () => {
    it('should escape structural HTML and attribute breakouts in vault-view.js', async () => {
        const stringArb = Arbitrary.string();

        const xssPayloadArb = {
            generate: () => {
                const str = stringArb.generate();
                return str + '"><script>alert(1)</script><div onmouseover="alert(1)">';
            },
            shrink: (val) => {
                const baseStr = val.substring(0, val.length - 56);
                const shrunk = stringArb.shrink(baseStr);
                return shrunk ? shrunk + '"><script>alert(1)</script><div onmouseover="alert(1)">' : null;
            }
        };

        await assertProperty([xssPayloadArb], (payload) => {
            const view = new VaultView(null, null);
            const escaped = view.escape(payload);

            if (escaped.includes('"') || escaped.includes('<') || escaped.includes('>')) {
                return false;
            }
            return true;
        });
    });
});
