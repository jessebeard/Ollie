import { describe, it, expect } from '../../test/utils/test-runner.js';
import { Arbitrary, assertProperty } from '../../test/utils/pbt.js';
import { VaultView } from '../../app/components/vault/components/vault-view.js';

describe('Security: HTML Escaping (XSS Prevention)', () => {
    it('vault-view.js escape should neutralize structural HTML characters', async () => {
        // VaultView can be instantiated with nulls for testing pure methods
        const view = new VaultView(null, null);

        await assertProperty(
            [Arbitrary.string(1, 100)],
            (input) => {
                const escaped = view.escape(input);
                return !/[<>"']/.test(escaped) && !/(?<!&[a-z0-9#]+);?&(?![a-z0-9#]+;)/i.test(escaped);
            },
            1000
        );
    });
});
