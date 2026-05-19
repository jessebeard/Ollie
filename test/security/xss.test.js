import { describe, it, expect } from '../utils/test-runner.js';
import { assertProperty, Arbitrary } from '../utils/pbt.js';
import { VaultView } from '../../app/components/vault/components/vault-view.js';

describe('XSS Prevention (PBT)', () => {
    it('should correctly escape HTML entities to prevent XSS', async () => {
        const view = new VaultView(null, null);

        await assertProperty(
            [Arbitrary.string(1, 100)],
            (input) => {
                const escaped = view.escape(input);

                // Assert no raw HTML tags can be formed
                const noScriptTags = !escaped.includes('<script');
                const noImgTags = !escaped.includes('<img');
                const noOnEvent = !escaped.includes('onerror=');
                const noRawLt = !escaped.includes('<');
                const noRawGt = !escaped.includes('>');

                // Assert quotes are escaped
                const noRawQuotes = !escaped.includes('"');

                // The input might be empty and string gen can output strings without quotes,
                // so we just make sure if the input HAS quotes/tags, they are escaped.
                return noScriptTags && noImgTags && noOnEvent && noRawLt && noRawGt && noRawQuotes;
            },
            1000 // Test with 1000 random strings
        );
    });
});
