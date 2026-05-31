## 2025-05-15 - DOM XSS in ModalManager
**Vulnerability:** The `ModalManager` in `app/components/vault/components/modal-manager.js` interpolates user-controlled strings (`title`, `label`, `initialValues`, etc.) directly into `innerHTML` using template literals, leading to DOM-based XSS and attribute breakouts.
**Learning:** Dynamic HTML construction using template literals requires explicit escaping for any variable content, especially since DOM text assignment only escapes tags, not quotes.
**Prevention:** Implement a robust `escapeHtml` function using regex and wrap all dynamic inputs before interpolation into `innerHTML`.
