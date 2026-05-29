## 2026-05-29 - ModalManager innerHTML XSS Vulnerability
**Vulnerability:** The `ModalManager` in the Vault UI was inserting unescaped variables directly into `innerHTML`, creating XSS vulnerabilities.
**Learning:** When generating dynamic HTML via template strings for `.innerHTML`, inputs must be explicitly escaped for all HTML structural characters (`<`, `>`, `&`, `"`, `'`) to prevent tag injection and attribute breakouts.
**Prevention:** Always use a robust regex-based `escapeHtml` function when interpolating variables into HTML strings, and use property-based testing to generate adversarial payloads verifying the absence of structural HTML breakouts.
