import { describe, it, expect } from './utils/test-runner.js';

describe('UI Tests', () => {
    it('Download link should be hidden initially', () => {
        const downloadLink = document.getElementById('download-link');
        expect(downloadLink).toBeDefined();
        expect(downloadLink.style.display).toBe('none');
    });
});
