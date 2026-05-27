## 2025-05-27 - [XSS in Password Vault HTML Escaping]
**Vulnerability:** The HTML escaping function `escapeHtml` in `app/vault.js` was vulnerable to XSS due to insufficient escaping of single and double quotes. The function used `div.innerHTML` after setting `div.textContent`, which escapes `<`, `>`, and `&`, but leaves quotes untouched.
**Learning:** Using `div.textContent` to escape HTML is insufficient for attribute injection vulnerabilities.
**Prevention:** Use a Regex replacement that covers all HTML special characters (`&`, `<`, `>`, `"`, `'`) explicitly when dynamically creating HTML blocks.
