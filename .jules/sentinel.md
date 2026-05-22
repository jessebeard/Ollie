## 2024-05-24 - ModalManager XSS
**Vulnerability:** ModalManager rendering dynamic forms using unescaped template literals.
**Learning:** Attribute injection via double quotes is possible when variables are interpolated into HTML templates without explicit escaping.
**Prevention:** Always escape `&`, `<`, `>`, `"`, and `'` when injecting user input into raw HTML string interpolations.
