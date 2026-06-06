## 2024-05-24 - Unescaped HTML Injection in ModalManager

**Vulnerability:** XSS vulnerability found in `ModalManager` methods (`prompt`, `showForm`, `confirm`, `showAlert`) due to unescaped string interpolations into `innerHTML`.
**Learning:** When using template literals and `innerHTML`, all dynamically supplied strings must be explicitly escaped, as DOM assignment (e.g. `textContent`) is not automatically applied.
**Prevention:** Use an explicit `escape` utility that handles `&`, `<`, `>`, `"`, and `'` characters for all variables injected into HTML string templates. Added a PBT generative test to enforce this.
