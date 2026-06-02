## 2023-10-27 - XSS Vulnerability in ModalManager

**Vulnerability:** The `ModalManager` component directly interpolates user-provided strings (like titles and messages) into `innerHTML` using template literals, leading to Cross-Site Scripting (XSS) vulnerabilities.

**Learning:** When using template literals for dynamic HTML construction, all variables containing potentially untrusted or dynamic text must be explicitly escaped. Relying on implicit trust for modal messages or titles can be dangerous if the input originates from a vault record or external source.

**Prevention:** Always implement and use a utility method to escape HTML entities (e.g., `&`, `<`, `>`, `"`, `'`) before interpolating dynamic string data into `innerHTML`.
