## YYYY-MM-DD - XSS Vulnerability in ModalManager
**Vulnerability:** XSS (Cross-Site Scripting) in `ModalManager.js`
**Learning:** `innerHTML` was used without escaping `title` and `message` properties in `prompt`, `confirm`, `showForm`, and `showAlert`. Any user-provided values flowing into these components could execute arbitrary JS.
**Prevention:** Always escape data before inserting it into the DOM via `innerHTML`, or use safer DOM manipulation methods (`textContent`, `createElement`).
