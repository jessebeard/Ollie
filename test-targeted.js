import { expect } from './test/utils/test-runner.js';

// Mock document
global.document = {
    createElement: () => {
        return {
            textContent: '',
            get innerHTML() {
                // The current implementation is susceptible to quotes breaking out
                // if not manually handled, but since it's just mock logic we'll just return it.
                // In actual browser, div.textContent = str; return div.innerHTML will escape <, >, & but NOT quotes!
                return this.textContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            }
        };
    }
};

const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

console.log(escapeHtml('" onmouseover="alert(1)"'));
