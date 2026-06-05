import { VaultView } from '../../../app/components/vault/components/vault-view.js';
import { Arbitrary, assertProperty } from '../../utils/pbt.js';
import { expect } from '../../utils/test-runner.js';

// Instantiate with nulls for pure function testing
const view = new VaultView(null, null);

const breakoutPayloads = [
    '"><img src=x onerror=alert(1)>',
    '" onfocus="alert(1)"',
    "javascript:alert(1)",
    "';alert(1)//"
];

const maliciousPayloadGen = () => {
    return breakoutPayloads[Math.floor(Math.random() * breakoutPayloads.length)];
};

// Custom Arbitrary to include breakout strings and primitives
const escapeArbitrary = {
    generate: () => {
        const rand = Math.random();
        if (rand < 0.2) return maliciousPayloadGen();
        if (rand < 0.4) return Arbitrary.string().generate() + maliciousPayloadGen() + Arbitrary.string().generate();
        if (rand < 0.5) return null;
        if (rand < 0.6) return undefined;
        if (rand < 0.7) return 0;
        if (rand < 0.8) return false;
        return Arbitrary.string().generate();
    },
    shrink: (val) => typeof val === 'string' ? [val.slice(0, val.length/2), val.replace(/[<>"'&]/g, '')] : []
};

console.log('\x1b[1mVaultView Escape (Property-Based Tests)\x1b[0m');

await assertProperty([escapeArbitrary], (input) => {
    const escaped = view.escape(input);

    // Should never contain raw structural characters
    if (typeof escaped === 'string') {
        expect(escaped.includes('<')).toBe(false);
        expect(escaped.includes('>')).toBe(false);
        expect(escaped.includes('"')).toBe(false);
        expect(escaped.includes("'")).toBe(false);
    }

    // Should gracefully handle non-strings (e.g. return '' or string representation)
    expect(typeof escaped).toBe('string');

    return true;
}, 500);
