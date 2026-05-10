import { executeTests } from './test/utils/test-runner.js';

// Setup DOM mock
const env = typeof global !== 'undefined' ? global : window;
if (!env.document) {
    const createElement = (tag) => {
        const el = {
            tagName: tag.toUpperCase(),
            className: '',
            style: {},
            children: [],
            appendChild: (child) => el.children.push(child),
            querySelector: () => null,
            _innerHTML: '',
            get innerHTML() { return this._innerHTML; },
            set innerHTML(val) { this._innerHTML = val; }
        };
        return el;
    };
    env.document = {
        createElement: createElement,
        body: createElement('body')
    };
}

import('./test/security/modal-manager-xss.test.js').then(() => {
    executeTests().catch(console.error);
});
