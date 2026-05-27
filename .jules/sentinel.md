## 2025-02-28 - XSS in ModalManager

**Vulnerability:** The `ModalManager` component interpolated user-controlled input (like entry names) directly into `.innerHTML` when rendering modals (e.g. `prompt`, `confirm`, `showForm`, `showAlert`), creating an XSS vulnerability.
**Learning:** Interpolating variables into HTML templates directly using `.innerHTML` allows executing arbitrary injected HTML.
**Prevention:** Explicitly escape all dynamic content in templates before rendering it via `.innerHTML`. Implemented an `escape()` function replacing `&`, `<`, `>`, `"`, and `'`.
