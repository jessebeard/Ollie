## 2024-05-30 - Missing HTML escaping in UI template interpolations

**Vulnerability:** XSS vulnerability in `ModalManager` components via `innerHTML` assignments using unescaped parameters.

**Learning:** When generating dynamic DOM components or templates via `innerHTML`, variables mapped straight from parameters are vulnerable to XSS and attribute injections if not properly escaped. Using `textContent` assignments natively prevents XSS but string interpolation requires explicit encoding.

**Prevention:** Make use of comprehensive HTML escaping that handles `<`, `>`, `&`, `"`, and `'`.
