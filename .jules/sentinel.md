## 2024-05-15 - Unsafe HTML Escaping (XSS Attribute Injection)
**Vulnerability:** The HTML escaping methods in VaultView (`escape`) and PasswordVault (`escapeHtml`) failed to sanitize single quotes, and `escapeHtml` used the `textContent` to `innerHTML` conversion which inherently leaves quotes unescaped, allowing for attribute injection XSS.
**Learning:** Using `textContent = text; return innerHTML` does not implicitly escape quotes (double or single). Additionally, only escaping double quotes manually still leaves single-quoted attributes vulnerable.
**Prevention:** Use explicit Regex string replacements for all five dangerous HTML characters (`&`, `<`, `>`, `"`, and `'`) instead of DOM-based serialization when generating dynamic HTML strings.
