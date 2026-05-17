## 2024-05-17 - XSS Vulnerability in UI Modals
**Vulnerability:** ModalManager component interpolated dynamic variables (like titles and labels) directly into `innerHTML` without escaping HTML entities.
**Learning:** Any dynamic string passed to UI creation methods can contain malicious script tags or layout-breaking HTML if not properly sanitized before assignment to `innerHTML`.
**Prevention:** Ensure that a robust `#escapeHTML` function is used for all dynamic values concatenated into an HTML template string before setting it via `innerHTML`.
