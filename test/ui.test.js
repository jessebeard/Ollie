import { describe, it, expect } from './utils/test-runner.js';

describe('UI Tests', () => {
    it('Download link should be hidden initially', () => {
        const downloadLink = document.getElementById('download-link');
        expect(downloadLink).toBeDefined();
        expect(downloadLink.style.display).toBe('none');
    });

    it('Should have a progressive encoding checkbox', () => {
        const checkbox = document.getElementById('progressive-checkbox');
        expect(checkbox).toBeDefined();
        expect(checkbox.type).toBe('checkbox');
        expect(checkbox.checked).toBe(false); // Default should be false
    });

    it('Should have a file info pane for decoder', () => {
        const infoPane = document.getElementById('decoder-info');
        expect(infoPane).not.toBe(null);
    });

    it('Should have a file info pane for encoder', () => {
        const infoPane = document.getElementById('encoder-info');
        expect(infoPane).not.toBe(null);
    });
});
