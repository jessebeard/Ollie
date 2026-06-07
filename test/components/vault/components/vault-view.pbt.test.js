import { describe, it, expect } from '../../../utils/test-runner.js';
import { assertProperty, Arbitrary } from '../../../utils/pbt.js';
import fs from 'fs';

const source = fs.readFileSync('app/components/vault/components/vault-view.js', 'utf8');
const escapeMatch = source.match(/escape\(str\)\s*{([^}]+)}/m);
let escapeFn;
if (escapeMatch) {
    escapeFn = new Function('str', escapeMatch[1]);
}

describe('VaultView Security Properties', () => {
    it('escape() should never produce unescaped structural HTML tags', async () => {
        expect(escapeFn).toBeDefined();

        const property = (str) => {
            const escaped = escapeFn.call({}, str);
            if (escaped === '') return true;
            // A secure escape should replace <, >, ", and ', &
            return !escaped.includes('<') && !escaped.includes('>') && !escaped.includes('"');
        };

        await assertProperty([Arbitrary.string(1, 100)], property);
    });

    it('escape() should never produce unescaped single quotes', async () => {
        expect(escapeFn).toBeDefined();

        const property = (str) => {
            const escaped = escapeFn.call({}, str);
            if (escaped === '') return true;
            return !escaped.includes("'");
        };

        await assertProperty([Arbitrary.string(1, 100)], property);
    });
});
