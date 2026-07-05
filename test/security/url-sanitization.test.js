import { Arbitrary, assertProperty } from '../utils/pbt.js';
import { getStats } from '../utils/test-runner.js';
import { VaultView } from '../../app/components/vault/components/vault-view.js';

const view = new VaultView(null, null);

let errors = 0;

try {
    await assertProperty(
        [Arbitrary.string()],
        (url) => {
            const result = view.sanitizeUrl(url);
            if (result === 'about:blank' || result === '') return true;

            const noSpaceResult = result.replace(/[\s\x00-\x20\x7F]+/g, '').toLowerCase();
            if (noSpaceResult.startsWith('javascript:')) return false;
            if (noSpaceResult.startsWith('data:')) return false;
            if (noSpaceResult.startsWith('vbscript:')) return false;
            if (noSpaceResult.startsWith('file:')) return false;

            return true;
        }
    );
    console.log('sanitizeUrl PBT passed');
} catch (e) {
    console.error('sanitizeUrl PBT failed:', e);
    errors++;
}

const fuzzInputs = [
    'javascript:alert(1)',
    '  javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'j a v a s c r i p t : alert(1)',
    '\x00javascript:alert(1)',
    'javascript\x00:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
];

for (const input of fuzzInputs) {
    const res = view.sanitizeUrl(input);
    if (res !== 'about:blank') {
        console.error(`Fuzzing failed for input: ${input}, got: ${res}`);
        errors++;
    }
}

const safeInputs = [
    'http://example.com',
    'https://example.com',
    'example.com',
    '/relative/path',
];

for (const input of safeInputs) {
    const res = view.sanitizeUrl(input);
    if (res === 'about:blank') {
        console.error(`Safe input incorrectly sanitized: ${input}`);
        errors++;
    }
}

const stats = getStats();
if (errors > 0) {
    stats.failed += errors;
} else {
    stats.passed++;
}
