
## 2025-05-10 - ModalManager DOM XSS Vulnerability
**Vulnerability:** Cross-Site Scripting (XSS) via `innerHTML` interpolation in `app/components/vault/components/modal-manager.js`.
**Learning:** Component templates constructed using ES6 template literals (`\``) and assigned directly to `innerHTML` are highly vulnerable to XSS if inputs (like titles, labels, or messages) are not sanitized. The codebase had no uniform escaping mechanism for dynamic prompt values.
**Prevention:** Always implement and enforce a strict `#escapeHTML` sanitization method before any dynamic value is concatenated into an HTML string destined for DOM insertion. Use generative testing (PBT) to assert that unexpected input spaces (like malformed strings or scripts) are effectively neutralized.
