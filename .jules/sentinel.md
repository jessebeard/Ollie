## 2024-05-17 - XSS in ModalManager
**Vulnerability:** ModalManager uses innerHTML without escaping user input in prompt, confirm, showForm, and showAlert methods. This allows XSS attacks if user input is passed to these methods.
**Learning:** Using innerHTML with dynamic unescaped values is a common vector for XSS. It relies on the caller to provide safe HTML, which is error-prone.
**Prevention:** Implement a robust HTML escaping method (e.g., `#escape(str)`) to sanitize all dynamic inputs before using innerHTML, or use DOM APIs like document.createTextNode for dynamic content.
