## 2024-05-28 - XSS via Incomplete HTML Escaping in Vault UI

**Vulnerability:** The Vault UI uses dynamic HTML string interpolation (`innerHTML`) for rendering user data (vault entries). The primary escaping functions (`escapeHtml` in `app/vault.js` and `escape` in `app/components/vault/components/vault-view.js`) are either missing single/double quote escaping or incorrectly relying on DOM `textContent` assignment which doesn't escape quotes, leaving the application vulnerable to attribute injection XSS (e.g., injecting payload via `data-password="${escapeHtml(password)}"`).

**Learning:** When generating HTML through string concatenation, relying solely on `div.textContent = str; return div.innerHTML;` is dangerous for attribute contexts because browsers don't escape `"` or `'` in `innerHTML` outputs unless absolutely necessary, and standard manual escaping missing quotes (`'`) leaves attributes vulnerable (e.g. `data-url="${this.escape(entry.url)}"`).

**Prevention:** Use a robust, pure regex-based escaping function that explicitly converts values to strings and escapes `&`, `<`, `>`, `"`, and `'`. Also include specific Property-Based Tests checking for attribute breakout sequences (e.g. `"><img src=x onerror=alert(1)>` and `' onfocus='alert(1)'`).
